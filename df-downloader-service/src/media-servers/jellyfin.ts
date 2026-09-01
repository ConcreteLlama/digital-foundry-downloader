import { MediaServerLibrary, logger } from "df-downloader-common";
import { JellyfinMediaServerConfig, JellyfinServerKey } from "df-downloader-common/config/media-servers-config.js";
import { describeConnectionError } from "./errors.js";
import { MediaServerClient, MediaServerTestResult } from "./types.js";

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
export class JellyfinMediaServer implements MediaServerClient {
  readonly type = JellyfinServerKey;

  /** Set once the server has rejected ScanPath, so it is tried once, not per file. */
  private targetedScanUnavailable = false;

  /** Only the connection fields - the mapping is the manager's concern, not this client's. */
  constructor(private readonly config: Pick<JellyfinMediaServerConfig, "url" | "apiKey">) {}

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
}
