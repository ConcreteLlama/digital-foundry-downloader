import path from "path";
import { logger } from "df-downloader-common";
import { TestMediaServerRequest } from "df-downloader-common";
import {
  JellyfinServerKey,
  MediaServerPathMapping,
  MediaServerType,
  MediaServersConfig,
  PlexServerKey,
  applyPathMapping,
} from "df-downloader-common/config/media-servers-config.js";
import { JellyfinMediaServer } from "./jellyfin.js";
import { PlexMediaServer } from "./plex.js";
import { canLinkToItem,
  MediaServerClient,
  MediaServerTestResult,
  ServerPlayState,
  canReadPlayState,
  canWritePlayState,
} from "./types.js";

/** Why a file changed. Only ever used for the log line, but that line is the whole diagnostic story. */
export type MediaChangeReason = "download" | "metadata" | "subtitles" | "moved";

type ConfiguredServer = {
  client: MediaServerClient;
  mapping?: MediaServerPathMapping;
  /** Whether this server wants to be told to rescan. */
  notifyOnChange: boolean;
  syncPlayState: boolean;
};

type PendingRefresh = { timer: NodeJS.Timeout; firstSeenMs: number; reasons: Set<MediaChangeReason> };

/**
 * Tells configured media servers when files on disk change.
 *
 * Everything that alters a file routes through `fileChanged`, and this decides
 * when to actually say anything. That indirection exists because a single
 * download is several changes in a row - the file lands, metadata is injected,
 * a subtitle sidecar appears beside it - and a server told three times will
 * scan three times, with a fair chance of reading the file mid-rewrite.
 *
 * Batching is per directory rather than per file, because that is the unit
 * both servers actually rescan.
 */
export class MediaServerManager {
  private servers: ConfiguredServer[] = [];
  private settleMs = 15_000;
  private pending = new Map<string, PendingRefresh>();

  /**
   * Rebuilt wholesale whenever config changes.
   *
   * Cheap, and it means a token edited in settings takes effect on the next
   * download rather than the next restart.
   */
  configure(config?: MediaServersConfig) {
    this.settleMs = (config?.settleSeconds ?? 15) * 1000;
    const servers: ConfiguredServer[] = [];
    const plex = config?.servers?.[PlexServerKey];
    if (plex?.enabled) {
      servers.push({
        client: new PlexMediaServer(plex),
        mapping: plex.pathMapping,
        notifyOnChange: plex.notifyOnChange,
        syncPlayState: plex.syncPlayState,
      });
    }
    const jellyfin = config?.servers?.[JellyfinServerKey];
    if (jellyfin?.enabled) {
      servers.push({
        client: new JellyfinMediaServer(jellyfin),
        mapping: jellyfin.pathMapping,
        notifyOnChange: jellyfin.notifyOnChange,
        syncPlayState: jellyfin.syncPlayState,
      });
    }
    this.servers = servers;
    const announcing = servers.filter((s) => s.notifyOnChange).map((s) => s.client.type);
    const watching = servers.filter((s) => s.syncPlayState).map((s) => s.client.type);
    logger.log(
      "info",
      servers.length
        ? `Media servers connected: ${servers.map((s) => s.client.type).join(", ")}` +
            ` (rescan on change: ${announcing.join(", ") || "none"}; watched state: ${watching.join(", ") || "none"})`
        : "No media servers configured."
    );
  }

  get enabled() {
    return this.servers.length > 0;
  }

  /**
   * Whether anything actually wants rescans.
   *
   * Checked before batching rather than only when flushing: a connection kept
   * purely for watched state should not accumulate pending timers for changes
   * nobody is going to be told about.
   */
  get announcesChanges() {
    return this.servers.some((server) => server.notifyOnChange);
  }

  /**
   * Note that a file changed. Returns immediately; the servers are told later.
   *
   * Never throws. A media server being unreachable must not fail a download -
   * the file is on disk and correct either way, and the worst case is the
   * server picks it up on its own schedule, which is what happened before this
   * feature existed.
   */
  fileChanged(localPath: string, reason: MediaChangeReason) {
    if (!this.announcesChanges || !localPath) {
      return;
    }
    const directory = path.dirname(localPath);
    const existing = this.pending.get(directory);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reasons.add(reason);
      // A directory being written to continuously would otherwise defer for
      // ever. Once it has been waiting several settle windows, stop resetting
      // and just tell them.
      if (Date.now() - existing.firstSeenMs >= this.settleMs * 5) {
        this.flush(directory);
        return;
      }
      existing.timer = setTimeout(() => this.flush(directory), this.settleMs);
      return;
    }
    this.pending.set(directory, {
      timer: setTimeout(() => this.flush(directory), this.settleMs),
      firstSeenMs: Date.now(),
      reasons: new Set([reason]),
    });
  }

  private flush(directory: string) {
    const entry = this.pending.get(directory);
    this.pending.delete(directory);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    const reasons = [...entry.reasons].join(", ");
    for (const { client, mapping, notifyOnChange } of this.servers) {
      if (!notifyOnChange) {
        continue;
      }
      const serverPath = applyPathMapping(directory, mapping);
      // Fire and forget, but log the failure - see the contract on
      // MediaServerClient.refreshPath.
      client.refreshPath(serverPath, reasons).catch((e) => {
        logger.log(
          "warn",
          `Could not tell ${client.type} about changes in "${serverPath}" (${reasons}): ${e?.message ?? e}`
        );
      });
    }
  }

  /**
   * Check one server's settings without waiting for a download.
   *
   * Built from the config passed in rather than the stored one, so the
   * settings form can test what is on screen before it is saved - the same
   * thing the DF session test does, and for the same reason.
   */
  async testConnection(request: TestMediaServerRequest): Promise<MediaServerTestResult> {
    const client =
      request.type === PlexServerKey
        ? new PlexMediaServer(request.config)
        : new JellyfinMediaServer(request.config);
    return client.testConnection();
  }

  /**
   * Record that someone watched part of a file, on every server set up for it.
   *
   * Deliberately does not throw. This is called while a video is playing, and
   * a media server being unreachable is not a reason to disturb playback - the
   * worst outcome is that the watch is not recorded, which is where things
   * stood before this existed.
   *
   * Resolving a path to an item is cached per client, because this arrives
   * repeatedly during a single viewing.
   */
  /**
   * Where else this file can be watched.
   *
   * Offered because the app on the other end is often the better place for
   * it: a phone gets a client built for the job, with no re-encoding, no held
   * connection and no custom transport - and play state already syncs both
   * ways, so handing over mid-video keeps the position rather than forking
   * it.
   *
   * Every configured server is asked, not just the ones syncing play state:
   * wanting to open something in Plex is unrelated to whether Plex is trusted
   * to record what you watched.
   *
   * A server that has not indexed the file yet simply contributes nothing.
   * That is the ordinary case for a fresh download, not a failure, and it is
   * why this returns a list rather than promising an answer.
   */
  async getItemLinks(localPath: string): Promise<{ server: string; url: string }[]> {
    const links: { server: string; url: string }[] = [];
    for (const { client, mapping } of this.servers) {
      if (!canLinkToItem(client)) {
        continue;
      }
      const serverPath = applyPathMapping(localPath, mapping);
      try {
        const url = await client.getItemUrl(serverPath);
        if (url) {
          links.push({ server: client.type, url });
        }
      } catch (e: any) {
        // Never fatal. This is a convenience beside a player that already
        // works, so one unreachable server must not cost the others their
        // links or the caller its response.
        logger.log("debug", `Could not build a ${client.type} link for "${serverPath}": ${e?.message ?? e}`);
      }
    }
    return links;
  }

  async reportPlayback(localPath: string, positionSeconds: number, durationSeconds: number) {
    for (const { client, mapping, syncPlayState } of this.servers) {
      if (!syncPlayState || !canWritePlayState(client)) {
        continue;
      }
      const serverPath = applyPathMapping(localPath, mapping);
      try {
        const itemId = await client.resolveItemId(serverPath);
        if (!itemId) {
          continue;
        }
        await client.reportPlayback(itemId, { positionSeconds, durationSeconds, serverPath });
      } catch (e: any) {
        logger.log("warn", `Could not record play state on ${client.type} for "${serverPath}": ${e?.message ?? e}`);
      }
    }
  }

  /**
   * Ask every server that can answer what it thinks you have watched.
   *
   * Takes and returns *local* paths - the manager owns mapping in both
   * directions, so neither the caller nor a client ever sees the other's
   * namespace.
   *
   * One entry per server rather than a merged answer: the merge rule needs to
   * know which server said what, and a server being unreachable should lose
   * only its own contribution rather than the whole sync.
   */
  async readPlayState(localPaths: string[]): Promise<{ source: MediaServerType; states: Map<string, ServerPlayState> }[]> {
    const results: { source: MediaServerType; states: Map<string, ServerPlayState> }[] = [];
    if (!localPaths.length) {
      return results;
    }
    for (const { client, mapping, syncPlayState } of this.servers) {
      if (!syncPlayState || !canReadPlayState(client)) {
        continue;
      }
      const localByServerPath = new Map<string, string>();
      for (const localPath of localPaths) {
        localByServerPath.set(applyPathMapping(localPath, mapping), localPath);
      }
      try {
        const states = await client.readPlayState([...localByServerPath.keys()]);
        const byLocalPath = new Map<string, ServerPlayState>();
        for (const [serverPath, state] of states) {
          const localPath = localByServerPath.get(serverPath);
          if (localPath) {
            byLocalPath.set(localPath, state);
          }
        }
        results.push({ source: client.type, states: byLocalPath });
      } catch (e: any) {
        logger.log("warn", `Could not read play state from ${client.type}: ${e?.message ?? e}`);
      }
    }
    return results;
  }

  /** Cancels anything still waiting. Used on shutdown so a pending timer cannot outlive the process. */
  stop() {
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }
}
