import { WatchState, WatchStateSyncResult, logger, setIntervalImmediate } from "df-downloader-common";
import { configService } from "../config/config.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";
import { WatchStateStore } from "../db/watch-state-store.js";
import { MediaServerManager } from "../media-servers/media-server-manager.js";

/**
 * Shortest gap between two pulls.
 *
 * Opening several items in a row is ordinary, and each open asks for a sync -
 * without this that is one full library read per click.
 */
const MIN_GAP_MS = 30_000;

/**
 * Pulls watched state back from Plex and Jellyfin into this app's own store.
 *
 * This app keeps watch state whether or not a media server exists, so this is
 * an additional *source* rather than the place the state lives. With no server
 * configured it does nothing at all, and everything still works.
 *
 * There is no per-item sync, deliberately. Neither server offers a lookup by
 * path, so reading one file's state means reading a library back - which means
 * syncing *everything* costs the same as syncing one thing. Given that, asking
 * about one item would be strictly worse: same cost, less answered.
 *
 * Webhooks would be the accurate version of this and both servers can send
 * them, but they need configuring on each server and an exposed endpoint. The
 * seam for that is `syncNow`, which is all a webhook handler would call.
 */
export class WatchStateSync {
  private stopTimer?: () => void;
  private lastRunMs = 0;
  private running = false;

  constructor(
    private readonly store: WatchStateStore,
    private readonly mediaServers: MediaServerManager,
    private readonly db: DfDownloaderOperationalDb
  ) {}

  start() {
    this.applySchedule();
    configService.on("configUpdated:mediaServers", () => this.applySchedule());
  }

  stop() {
    this.stopTimer?.();
    this.stopTimer = undefined;
  }

  private get intervalMs() {
    const minutes = configService.config.mediaServers?.playStateSyncMinutes ?? 30;
    return minutes > 0 ? minutes * 60_000 : 0;
  }

  /**
   * Rebuilt whenever the config changes, so an edited interval takes effect
   * without a restart - the same approach the media server manager takes to
   * its own settings.
   */
  private applySchedule() {
    this.stop();
    if (!this.mediaServers.enabled) {
      return;
    }
    const interval = this.intervalMs;
    if (!interval) {
      logger.log("info", "Watched state will not be pulled from media servers on a timer; it is still checked when you open something.");
      return;
    }
    /*
     * Runs once shortly after arming as well as on the interval - without
     * that, setting this up does nothing at all until the first tick, which
     * on a half-hour timer reads as broken. The short delay keeps it out of
     * the way of startup, and syncNow's own throttle stops repeated config
     * saves causing repeated library reads.
     */
    this.stopTimer = setIntervalImmediate(
      () => {
        this.syncNow("scheduled").catch((e) => logger.log("warn", `Watched state sync failed: ${e?.message ?? e}`));
      },
      interval,
      { initialDelayMs: 10_000 }
    );
    logger.log("info", `Will pull watched state from media servers every ${Math.round(interval / 60_000)} minutes.`);
  }

  /**
   * Pull once.
   *
   * Throttled rather than queued: if a sync ran seconds ago its answer is
   * still current, and the caller - usually a content view opening - has
   * nothing to do with the result anyway.
   */
  async syncNow(reason: string, { force = false }: { force?: boolean } = {}): Promise<WatchStateSyncResult> {
    const skipped: WatchStateSyncResult = { ran: false, changed: 0, servers: [] };
    if (!this.mediaServers.enabled) {
      return skipped;
    }
    if (this.running) {
      return skipped;
    }
    if (!force && Date.now() - this.lastRunMs < MIN_GAP_MS) {
      return skipped;
    }
    this.running = true;
    this.lastRunMs = Date.now();
    try {
      return await this.pull(reason);
    } finally {
      this.running = false;
    }
  }

  private async pull(reason: string): Promise<WatchStateSyncResult> {
    const entries = await this.db.getAllContentEntries();
    // One path may belong to only one piece of content, but a piece of content
    // can have several downloads - any of which is the file a server knows.
    const contentKeyByPath = new Map<string, string>();
    for (const entry of entries) {
      for (const download of entry.downloads ?? []) {
        if (download.downloadLocation) {
          contentKeyByPath.set(download.downloadLocation, entry.key);
        }
      }
    }
    if (!contentKeyByPath.size) {
      return { ran: true, changed: 0, servers: [] };
    }

    const results = await this.mediaServers.readPlayState([...contentKeyByPath.keys()]);
    let changed = 0;
    const perServer: WatchStateSyncResult["servers"] = [];
    for (const { source, states } of results) {
      perServer.push({ source, asked: contentKeyByPath.size, matched: states.size });
      /*
       * Said out loud even when it is zero.
       *
       * A wrong path mapping produces exactly this - a server that answers
       * happily and recognises none of the files - and it is by far the most
       * common way this feature fails. Logging only on change made that
       * indistinguishable from "nothing to do", which is the failure mode
       * this whole feature is prone to.
       */
      if (!states.size) {
        logger.log(
          "info",
          `${source} recognised none of the ${contentKeyByPath.size} downloaded files it was asked about. ` +
            `If it does have them, the path mapping for ${source} is probably wrong.`
        );
      } else {
        logger.log("info", `${source} recognised ${states.size} of ${contentKeyByPath.size} downloaded files.`);
      }
      for (const [localPath, state] of states) {
        const contentKey = contentKeyByPath.get(localPath);
        if (!contentKey) {
          continue;
        }
        const before = this.store.get(contentKey);
        const incoming: WatchState = {
          contentKey,
          watched: state.watched,
          positionSeconds: state.positionSeconds,
          durationSeconds: state.durationSeconds,
          /*
           * Epoch when the server did not say, so it loses every tie against
           * something that did. A server with no timestamp still contributes
           * its watched flag, which is sticky, but must not be able to drag a
           * resume point backwards just by being the most recent poll.
           */
          updatedAt: state.updatedAt ?? new Date(0),
          source,
        };
        const after = this.store.apply(incoming);
        if (!before || before.watched !== after.watched || before.positionSeconds !== after.positionSeconds) {
          changed++;
        }
      }
    }
    if (changed) {
      logger.log("info", `Pulled watched state from media servers (${reason}): ${changed} updated.`);
    }
    return { ran: true, changed, servers: perServer };
  }
}
