import { logger, makeSuccessResponse } from "df-downloader-common";
import { Request, Response } from "express";

/**
 * How often to re-sample a channel that reports itself active.
 *
 * The task engine is event-driven for state *transitions*, but the numbers
 * that move continuously are pull-only: Download.getStatus() reads its context
 * on demand and the FSM emits stateChanged solely on genuine state changes, so
 * nothing fires as bytes arrive. The DF request queue has no emitter at all.
 * A purely event-driven stream would therefore leave progress bars frozen
 * until a download finished. Sampling at the rate the UI used to poll at keeps
 * them moving identically, while dropping to zero traffic the moment nothing
 * is running - which is the overwhelming majority of the time, and the entire
 * point of the exercise.
 */
const SAMPLE_INTERVAL_MS = 1000;

/**
 * Sent as an SSE comment line, which clients ignore. Keeps intermediaries from
 * treating an idle stream as dead and closing it; an idle stream is the normal
 * resting state here, so without this the connection would routinely be
 * dropped and re-established for no reason.
 */
const HEARTBEAT_INTERVAL_MS = 20000;

export type StreamChannel<T = any> = {
  /** SSE event name. Clients use addEventListener(name, ...). */
  name: string;
  /** Produces the full snapshot for this channel. */
  build: () => Promise<T> | T;
  /**
   * Subscribe to this channel's change events. Returns an unsubscribe function.
   * Optional - a channel with no push events relies purely on sampling.
   */
  subscribe?: (onChange: () => void) => () => void;
  /**
   * Whether this channel currently needs periodic sampling (i.e. something is
   * in flight whose progress no event will announce). Omit for channels that
   * only ever change via `subscribe`.
   */
  hasActiveWork?: () => boolean;
};

/**
 * Fans multiple named channels out to every connected SSE client over a single
 * connection.
 *
 * One stream rather than one per data source: SSE's named events exist exactly
 * for this, so the client opens one connection, authenticates once, and gets a
 * single reconnect story - and stays well clear of the browser's ~6
 * connections-per-origin limit however many channels get added later.
 *
 * The fan-out is shared rather than per-connection: several browser tabs are a
 * normal state for this app, and giving each its own listeners, timers and
 * snapshot builds would multiply the work (including DB reads) by the number of
 * open tabs to produce byte-identical output. Each snapshot is built and
 * serialized once and the same frame written to every client.
 *
 * Subscriptions and timers exist only while at least one client is connected,
 * so a server nobody is watching does no periodic work at all.
 */
export class StreamBroadcaster {
  private readonly clients = new Set<Response>();
  private readonly unsubscribes: (() => void)[] = [];
  private sampleTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /**
   * Last frame sent per channel, so a sample that produced no actual change
   * isn't sent again. Matters most for channels whose payload is static while
   * they're nominally "active" - the DF queue's countdowns are absolute
   * timestamps the client renders locally, so a waiting queue serializes
   * identically every tick and would otherwise be resent once a second for
   * nothing.
   */
  private readonly lastFrame = new Map<string, string>();
  private readonly sending = new Set<string>();
  private readonly resendWanted = new Set<string>();

  constructor(private readonly channels: StreamChannel[]) {}

  get clientCount() {
    return this.clients.size;
  }

  private frameFor(channel: StreamChannel, data: unknown) {
    // Same {success, data} envelope as the REST endpoints, so clients can put
    // it through parseResponseBody unchanged.
    return `event: ${channel.name}\ndata: ${JSON.stringify(makeSuccessResponse(data))}\n\n`;
  }

  private writeToAll(frame: string) {
    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch (e) {
        // A failed write means the socket is gone in a way that didn't fire
        // 'close' - drop it rather than retrying it forever.
        logger.log("warn", "Dropping realtime stream client after write failure", e);
        this.removeClient(client);
      }
    }
  }

  private async broadcastChannel(channel: StreamChannel) {
    if (!this.clients.size) {
      return;
    }
    // Snapshot building can be async (the tasks channel reads the completed
    // pipeline history), so a change can land mid-build. Rather than queue
    // overlapping builds, note that another is wanted and do exactly one more
    // when this one lands - a newer snapshot supersedes the queued ones.
    if (this.sending.has(channel.name)) {
      this.resendWanted.add(channel.name);
      return;
    }
    this.sending.add(channel.name);
    try {
      do {
        this.resendWanted.delete(channel.name);
        const frame = this.frameFor(channel, await channel.build());
        if (!this.clients.size) {
          return;
        }
        if (this.lastFrame.get(channel.name) === frame) {
          continue;
        }
        this.lastFrame.set(channel.name, frame);
        this.writeToAll(frame);
      } while (this.resendWanted.has(channel.name));
    } catch (e) {
      logger.log("error", `Failed to build realtime update for channel "${channel.name}"`, e);
    } finally {
      this.sending.delete(channel.name);
    }
  }

  private startSharedWork() {
    if (this.sampleTimer) {
      return;
    }
    for (const channel of this.channels) {
      const unsubscribe = channel.subscribe?.(() => void this.broadcastChannel(channel));
      if (unsubscribe) {
        this.unsubscribes.push(unsubscribe);
      }
    }
    // Checking activity per tick is cheaper than starting and stopping timers
    // as work comes and goes, and can't miss work that starts between ticks.
    this.sampleTimer = setInterval(() => {
      for (const channel of this.channels) {
        if (channel.hasActiveWork?.()) {
          void this.broadcastChannel(channel);
        }
      }
    }, SAMPLE_INTERVAL_MS);
    this.heartbeatTimer = setInterval(() => this.writeToAll(": heartbeat\n\n"), HEARTBEAT_INTERVAL_MS);
  }

  private stopSharedWork() {
    this.unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // A later client starts from a clean slate rather than being deduped
    // against a frame sent before it existed.
    this.lastFrame.clear();
  }

  private removeClient(res: Response) {
    if (!this.clients.delete(res)) {
      return;
    }
    if (!this.clients.size) {
      this.stopSharedWork();
    }
    logger.log("debug", `Realtime stream client disconnected (${this.clients.size} remaining)`);
  }

  async addClient(req: Request, res: Response) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which makes a working
      // stream look like it's hung - events pile up in the proxy instead of
      // arriving. This opts out per-response, so anyone fronting this with
      // nginx/SWAG/NPM gets working updates without editing a proxy config.
      // Ignored by everything else, so it costs nothing to always send.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // Node's default socket timeout would eventually kill a legitimately idle
    // stream, and Nagle's algorithm would sit on small events waiting for more
    // data to batch with - both defaults are wrong for this.
    res.socket?.setTimeout(0);
    res.socket?.setNoDelay(true);
    res.socket?.setKeepAlive(true);

    this.clients.add(res);
    this.startSharedWork();
    logger.log("debug", `Realtime stream client connected (${this.clients.size} total)`);

    // Without this every reconnect - a tab refresh, or EventSource recovering
    // from a network blip - would leave its listeners attached forever.
    req.on("close", () => this.removeClient(res));

    // Sent to this client alone: a joining tab needs current state for every
    // channel immediately, and the already-connected ones have it. Deliberately
    // bypasses the lastFrame dedupe, which is about not resending to clients
    // that already received a frame.
    for (const channel of this.channels) {
      try {
        res.write(this.frameFor(channel, await channel.build()));
      } catch (e) {
        logger.log("error", `Failed to send initial "${channel.name}" snapshot`, e);
      }
    }
  }
}
