import path from "path";
import { logger } from "df-downloader-common";
import { TestMediaServerRequest } from "df-downloader-common";
import {
  JellyfinServerKey,
  MediaServerPathMapping,
  MediaServersConfig,
  PlexServerKey,
  applyPathMapping,
} from "df-downloader-common/config/media-servers-config.js";
import { JellyfinMediaServer } from "./jellyfin.js";
import { PlexMediaServer } from "./plex.js";
import { MediaServerClient, MediaServerTestResult } from "./types.js";

/** Why a file changed. Only ever used for the log line, but that line is the whole diagnostic story. */
export type MediaChangeReason = "download" | "metadata" | "subtitles" | "moved";

type ConfiguredServer = { client: MediaServerClient; mapping?: MediaServerPathMapping };

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
      servers.push({ client: new PlexMediaServer(plex), mapping: plex.pathMapping });
    }
    const jellyfin = config?.servers?.[JellyfinServerKey];
    if (jellyfin?.enabled) {
      servers.push({ client: new JellyfinMediaServer(jellyfin), mapping: jellyfin.pathMapping });
    }
    this.servers = servers;
    logger.log(
      "info",
      servers.length
        ? `Media servers to notify on change: ${servers.map((s) => s.client.type).join(", ")}`
        : "No media servers configured; file changes will not be announced."
    );
  }

  get enabled() {
    return this.servers.length > 0;
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
    if (!this.enabled || !localPath) {
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
    for (const { client, mapping } of this.servers) {
      const serverPath = applyPathMapping(directory, mapping);
      // Fire and forget, but log the failure - see the contract on
      // MediaServerClient.refreshPath.
      client.refreshPath(serverPath).catch((e) => {
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

  /** Cancels anything still waiting. Used on shutdown so a pending timer cannot outlive the process. */
  stop() {
    for (const { timer } of this.pending.values()) {
      clearTimeout(timer);
    }
    this.pending.clear();
  }
}
