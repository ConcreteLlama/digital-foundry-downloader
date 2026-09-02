import { MediaServerLibrary, logger } from "df-downloader-common";
import { JellyfinMediaServerConfig, JellyfinServerKey } from "df-downloader-common/config/media-servers-config.js";
import { describeConnectionError } from "./errors.js";
import {
  MediaServerClient,
  MediaServerTestResult,
  PlayStateWriter,
  PlaybackReport,
  WATCHED_FRACTION,
} from "./types.js";

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Jellyfin, refreshed as narrowly as this server will allow.
 *
 * Narrower than Plex allows, unfortunately. Plex takes a path on its refresh
 * endpoint; stock Jellyfin has no equivalent, and the community answer is a
 * plugin (Targeted Scans) that adds `POST /Library/ScanPath` and makes a
 * single-directory scan near-instant whatever the library size. Jellyfin's own
 * tracker carries an open issue about how slow partial scans are without it.
 *
 * So this tries the targeted call first and falls back to asking for a library
 * refresh. Both are correct; the fallback is just heavier, and which one ran is
 * logged so that "why is this slow" has an answer rather than a shrug.
 */
export class JellyfinMediaServer implements MediaServerClient, PlayStateWriter {
  readonly type = JellyfinServerKey;

  /** Set once the server has rejected ScanPath, so it is tried once, not per file. */
  private targetedScanUnavailable = false;

  /** Only the connection fields - the mapping is the manager's concern, not this client's. */
  constructor(
    private readonly config: Pick<JellyfinMediaServerConfig, "url" | "apiKey"> &
      Partial<Pick<JellyfinMediaServerConfig, "userId" | "userToken">>
  ) {}

  /**
   * Both header spellings, on purpose.
   *
   * Jellyfin 12 stopped reading `X-Emby-Token` and requires the standard
   * `Authorization` header; older versions document `X-Emby-Authorization`.
   * Sending both costs nothing and means this works either side of that
   * change, which matters for a self-hosted tool where nobody upgrades in step.
   */
  private headers(): Record<string, string> {
    const credential = `MediaBrowser Token="${this.config.apiKey}"`;
    return {
      Authorization: credential,
      "X-Emby-Authorization": credential,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * The same request, but signed as the user rather than as the installation.
   *
   * Play state belongs to a person, and an API key is not one - recent
   * Jellyfin versions reject played-status writes made with a key outright.
   * Falls back to the API key when no user token has been set up, so the call
   * fails with Jellyfin's own error rather than silently doing nothing.
   */
  private async userRequest(path: string, init?: RequestInit) {
    const base = this.config.url.replace(/\/+$/, "");
    const credential = `MediaBrowser Token="${this.config.userToken ?? this.config.apiKey}"`;
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: credential,
        "X-Emby-Authorization": credential,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  private async request(path: string, init?: RequestInit) {
    const base = this.config.url.replace(/\/+$/, "");
    return fetch(`${base}${path}`, {
      ...init,
      headers: this.headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  async refreshPath(serverPath: string): Promise<void> {
    if (!this.targetedScanUnavailable) {
      const response = await this.request("/Library/ScanPath", {
        method: "POST",
        body: JSON.stringify({ Path: serverPath }),
      });
      if (response.ok) {
        logger.log("info", `Asked Jellyfin to scan "${serverPath}"`);
        return;
      }
      // 404 means no Targeted Scans plugin; anything else in that family means
      // this server will not take the targeted call either. Either way, stop
      // asking - this runs on every changed file.
      if (response.status === 404 || response.status === 405 || response.status === 400) {
        this.targetedScanUnavailable = true;
        logger.log(
          "info",
          `Jellyfin does not accept targeted path scans (HTTP ${response.status}), so a full library refresh will be used instead. Installing the Targeted Scans plugin makes this instant rather than a whole-library scan.`
        );
      } else {
        throw new Error(`Jellyfin responded ${response.status} ${response.statusText} to a targeted scan`);
      }
    }

    const refresh = await this.request("/Library/Refresh", { method: "POST" });
    if (!refresh.ok) {
      throw new Error(`Jellyfin responded ${refresh.status} ${refresh.statusText} to a library refresh`);
    }
    logger.log("info", `Asked Jellyfin to refresh its libraries after a change to "${serverPath}"`);
  }

  /**
   * The server's libraries and the paths behind them, best effort.
   *
   * Only used to offer real options in the path-mapping field, so a failure
   * here is not a failed test - an API key without admin rights can read
   * System/Info and not this. Falls back to an empty list and the field simply
   * accepts free text, which is what it did before.
   */
  private async getLibraries(): Promise<MediaServerLibrary[]> {
    try {
      const response = await this.request("/Library/VirtualFolders");
      if (!response.ok) {
        return [];
      }
      const folders: any[] = await response.json();
      return (folders ?? []).map((folder) => ({
        title: String(folder?.Name ?? "Library"),
        locations: (folder?.Locations ?? []).map((l: any) => String(l)),
      }));
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<MediaServerTestResult> {
    try {
      const response = await this.request("/System/Info");
      if (response.status === 401) {
        return { ok: false, error: "Jellyfin rejected the API key (401). Create a new one under Dashboard, API Keys." };
      }
      if (!response.ok) {
        return { ok: false, error: `Jellyfin responded ${response.status} ${response.statusText}.` };
      }
      const info: any = await response.json();
      const libraries = await this.getLibraries();
      return {
        ok: true,
        detail: libraries.length
          ? `Connected to ${info?.ServerName ?? "Jellyfin"} (version ${info?.Version ?? "unknown"}). Libraries: ${libraries
              .map((l) => `${l.title} (${l.locations.join(", ")})`)
              .join("; ")}`
          : `Connected to ${info?.ServerName ?? "Jellyfin"} (version ${info?.Version ?? "unknown"}).`,
        libraries,
      };
    } catch (e: any) {
      return { ok: false, error: describeConnectionError(e, this.config.url) };
    }
  }

  /**
   * Resolved once per file and remembered.
   *
   * Jellyfin has no way to ask for the item at a given path: Path is a field
   * you can have returned, not one you can filter on. So resolution reads the
   * library back with Fields=Path and matches here. Expensive enough that it
   * must not happen per progress tick, hence the cache.
   *
   * Misses are not cached, for the same reason as Plex - a file downloaded
   * moments ago may simply not be scanned yet.
   */
  private itemIdByPath = new Map<string, string>();

  async resolveItemId(serverPath: string): Promise<string | null> {
    const cached = this.itemIdByPath.get(serverPath);
    if (cached) {
      return cached;
    }
    if (!this.config.userId) {
      logger.log(
        "warn",
        "Jellyfin play state needs a signed-in user, and none is set up. Sign in under Settings, Media Servers."
      );
      return null;
    }
    const response = await this.userRequest(
      `/Users/${this.config.userId}/Items?Recursive=true&Fields=Path&IncludeItemTypes=Movie,Episode,Video`
    );
    if (!response.ok) {
      throw new Error(`Jellyfin responded ${response.status} ${response.statusText} when listing items`);
    }
    const body: any = await response.json();
    const target = serverPath.replace(/\\/g, "/").toLowerCase();
    const match = (body?.Items ?? []).find(
      (item: any) => item?.Path && String(item.Path).replace(/\\/g, "/").toLowerCase() === target
    );
    if (!match) {
      logger.log(
        "info",
        `Jellyfin has not indexed "${serverPath}" yet, so there is nothing to record play state against.`
      );
      return null;
    }
    this.itemIdByPath.set(serverPath, String(match.Id));
    return String(match.Id);
  }

  /** Set once the server refuses progress reports, so it is tried once rather than every tick. */
  private progressUnavailable = false;

  async reportPlayback(itemId: string, { positionSeconds, durationSeconds }: PlaybackReport): Promise<void> {
    const userId = this.config.userId;
    if (!userId) {
      return;
    }
    const watched = durationSeconds > 0 && positionSeconds / durationSeconds >= WATCHED_FRACTION;

    if (!this.progressUnavailable) {
      // Ticks, not seconds - Jellyfin measures in 100-nanosecond units.
      const ticks = Math.floor(positionSeconds * 10_000_000);
      const progress = await this.userRequest(
        `/Users/${userId}/PlayingItems/${itemId}/Progress?positionTicks=${ticks}`,
        { method: "POST" }
      );
      if (!progress.ok) {
        this.progressUnavailable = true;
        logger.log(
          "info",
          `Jellyfin would not take a progress report (HTTP ${progress.status}); watched state will still be recorded, but resume points will not.`
        );
      }
    }

    if (watched) {
      const played = await this.userRequest(`/Users/${userId}/PlayedItems/${itemId}`, { method: "POST" });
      if (!played.ok) {
        throw new Error(`Jellyfin responded ${played.status} ${played.statusText} when marking an item played`);
      }
      logger.log("info", `Marked Jellyfin item ${itemId} watched.`);
    }
  }
}

/**
 * Signs in to Jellyfin and returns a user token.
 *
 * Standalone rather than a method, because it runs before any server is
 * configured - there is nothing to construct a client from yet.
 *
 * The Client/Device/Version preamble is not decoration: Jellyfin rejects an
 * authentication request without it.
 */
export const jellyfinSignIn = async (
  url: string,
  username: string,
  password: string
): Promise<{ ok: true; userId: string; userToken: string; username: string } | { ok: false; error: string }> => {
  const base = url.replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/Users/AuthenticateByName`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Emby-Authorization":
          'MediaBrowser Client="df-downloader", Device="df-downloader", DeviceId="df-downloader", Version="1.0.0"',
      },
      body: JSON.stringify({ Username: username, Pw: password }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401) {
      return { ok: false, error: "Jellyfin rejected that username and password." };
    }
    if (!response.ok) {
      return { ok: false, error: `Jellyfin responded ${response.status} ${response.statusText}.` };
    }
    const body: any = await response.json();
    const userId = body?.User?.Id;
    const userToken = body?.AccessToken;
    if (!userId || !userToken) {
      return { ok: false, error: "Jellyfin accepted the sign-in but returned no user token." };
    }
    return { ok: true, userId: String(userId), userToken: String(userToken), username: String(body?.User?.Name ?? username) };
  } catch (e: any) {
    return { ok: false, error: describeConnectionError(e, url) };
  }
};
