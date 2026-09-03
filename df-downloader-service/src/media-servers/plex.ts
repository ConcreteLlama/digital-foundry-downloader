import { logger } from "df-downloader-common";
import { PlexMediaServerConfig, PlexServerKey } from "df-downloader-common/config/media-servers-config.js";
import { describeConnectionError } from "./errors.js";
import {
  MediaServerClient,
  MediaServerTestResult,
  PlayStateReader,
  PlayStateWriter,
  PlaybackReport,
  ServerPlayState,
  WATCHED_FRACTION,
} from "./types.js";

const REQUEST_TIMEOUT_MS = 15_000;

type PlexSection = { key: string; title: string; locations: string[] };

const normalise = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * Plex, refreshed one directory at a time.
 *
 * Plex takes a `path` on its section refresh endpoint and rescans only that
 * directory, which is the whole point of this feature - a full rescan of a
 * large library on every completed download is exactly what the media server
 * does not want.
 *
 * Sections are discovered rather than configured. Plex identifies a library by
 * a numeric key that means nothing to a person, and asking someone to find it
 * in a URL is the kind of setup step that gets entered wrong once and then
 * silently does nothing forever. Instead the section is matched by which of
 * its own reported locations contains the changed path.
 */
export class PlexMediaServer implements MediaServerClient, PlayStateWriter {
  readonly type = PlexServerKey;

  /** Only the connection fields - the mapping is the manager's concern, not this client's. */
  constructor(private readonly config: Pick<PlexMediaServerConfig, "url" | "token">) {}

  private url(path: string, params: Record<string, string> = {}) {
    const base = this.config.url.replace(/\/+$/, "");
    const search = new URLSearchParams({ ...params, "X-Plex-Token": this.config.token });
    return `${base}${path}?${search.toString()}`;
  }

  private async request(path: string, params?: Record<string, string>) {
    const response = await fetch(this.url(path, params), {
      // Plex speaks XML by default and JSON when asked. Asking avoids pulling
      // in an XML parser for one endpoint.
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Plex responded ${response.status} ${response.statusText} for ${path}`);
    }
    return response;
  }

  private async getSections(): Promise<PlexSection[]> {
    const body: any = await (await this.request("/library/sections")).json();
    const directories: any[] = body?.MediaContainer?.Directory ?? [];
    return directories.map((directory) => ({
      key: String(directory.key),
      title: String(directory.title ?? directory.key),
      locations: (directory.Location ?? []).map((location: any) => String(location.path)),
    }));
  }

  /**
   * The section whose own location contains this path.
   *
   * Longest location wins, for the same reason path mappings prefer the
   * longest match: nested libraries are normal, and the more specific one is
   * the one that actually holds the file.
   */
  private static sectionFor(sections: PlexSection[], serverPath: string) {
    const target = normalise(serverPath);
    return sections
      .flatMap((section) => section.locations.map((location) => ({ section, location: normalise(location) })))
      .filter(({ location }) => target === location || target.startsWith(`${location}/`))
      .sort((a, b) => b.location.length - a.location.length)[0]?.section;
  }

  async refreshPath(serverPath: string, reason?: string): Promise<void> {
    const sections = await this.getSections();
    const section = PlexMediaServer.sectionFor(sections, serverPath);
    if (!section) {
      // Deliberately loud, and deliberately not an exception. This is the
      // symptom of a wrong path mapping, and the only way anyone finds out is
      // if the log says which path was looked for and what Plex actually has.
      logger.log(
        "warn",
        `Plex has no library containing "${serverPath}", so nothing was refreshed. Plex's libraries are: ${
          sections.map((s) => `${s.title} (${s.locations.join(", ")})`).join("; ") || "none"
        }. This usually means the path mapping for Plex is wrong.`
      );
      return;
    }
    await this.request(`/library/sections/${section.key}/refresh`, { path: serverPath });
    logger.log(
      "info",
      `Asked Plex to rescan "${serverPath}" in library "${section.title}"${reason ? ` (${reason})` : ""}`
    );
  }

  async testConnection(): Promise<MediaServerTestResult> {
    try {
      const sections = await this.getSections();
      if (!sections.length) {
        return { ok: false, error: "Connected to Plex, but it reports no libraries." };
      }
      return {
        ok: true,
        detail: `Connected. Libraries: ${sections.map((s) => `${s.title} (${s.locations.join(", ")})`).join("; ")}`,
        libraries: sections.map(({ title, locations }) => ({ title, locations })),
      };
    } catch (e: any) {
      // A bad token is a 401 and reads as "unauthorized", which is worth
      // saying plainly rather than surfacing a bare status code.
      const message = String(e?.message ?? e);
      return {
        ok: false,
        error: message.includes("401")
          ? `${message} - the Plex token looks wrong or expired.`
          : describeConnectionError(e, this.config.url),
      };
    }
  }

  /**
   * Resolved once per file and remembered, including the misses.
   *
   * Resolution means reading a whole library section back and comparing file
   * paths, because Plex offers no "give me the item at this path" call. That is
   * far too expensive to repeat on every progress tick - which arrives every
   * few seconds while something plays.
   *
   * Misses are deliberately NOT cached. A file downloaded moments ago
   * genuinely may not be in Plex yet, and remembering that as a permanent
   * "no such item" would mean it never gained play state at all.
   */
  private itemIdByPath = new Map<string, string | null>();

  async resolveItemId(serverPath: string): Promise<string | null> {
    if (this.itemIdByPath.has(serverPath)) {
      return this.itemIdByPath.get(serverPath) ?? null;
    }
    const sections = await this.getSections();
    const section = PlexMediaServer.sectionFor(sections, serverPath);
    if (!section) {
      logger.log("warn", `Plex has no library containing "${serverPath}", so play state cannot be recorded for it. This usually means the path mapping for Plex is wrong.`);
      return null;
    }
    const body: any = await (await this.request(`/library/sections/${section.key}/all`)).json();
    const items: any[] = body?.MediaContainer?.Metadata ?? [];
    const target = normalise(serverPath);
    let found: string | null = null;
    for (const item of items) {
      for (const media of item?.Media ?? []) {
        for (const part of media?.Part ?? []) {
          if (part?.file && normalise(String(part.file)) === target) {
            found = String(item.ratingKey);
          }
        }
      }
    }
    if (found) {
      this.itemIdByPath.set(serverPath, found);
    } else {
      logger.log(
        "info",
        `Plex has not indexed "${serverPath}" yet, so there is nothing to record play state against. It will be looked for again next time.`
      );
    }
    return found;
  }

  /**
   * Play state for many paths, one library read per section.
   *
   * Grouped by section deliberately: reading a section back is the expensive
   * part, so a hundred files in one library cost one request rather than a
   * hundred. Paths in no library are skipped rather than reported - that is
   * the path-mapping symptom, and resolveItemId already says so loudly.
   */
  async readPlayState(serverPaths: string[]): Promise<Map<string, ServerPlayState>> {
    const out = new Map<string, ServerPlayState>();
    if (!serverPaths.length) {
      return out;
    }
    const sections = await this.getSections();
    const bySection = new Map<string, Map<string, string>>();
    for (const serverPath of serverPaths) {
      const section = PlexMediaServer.sectionFor(sections, serverPath);
      if (!section) {
        continue;
      }
      const key = String(section.key);
      let targets = bySection.get(key);
      if (!targets) {
        targets = new Map();
        bySection.set(key, targets);
      }
      targets.set(normalise(serverPath), serverPath);
    }
    for (const [key, targets] of bySection) {
      const body: any = await (await this.request(`/library/sections/${key}/all`)).json();
      for (const item of body?.MediaContainer?.Metadata ?? []) {
        for (const media of item?.Media ?? []) {
          for (const part of media?.Part ?? []) {
            const original = part?.file ? targets.get(normalise(String(part.file))) : undefined;
            if (!original) {
              continue;
            }
            out.set(original, {
              watched: Number(item?.viewCount ?? 0) > 0,
              // Plex counts in milliseconds; lastViewedAt is epoch seconds.
              positionSeconds: Number(item?.viewOffset ?? 0) / 1000,
              durationSeconds: item?.duration ? Number(item.duration) / 1000 : undefined,
              updatedAt: item?.lastViewedAt ? new Date(Number(item.lastViewedAt) * 1000) : undefined,
            });
          }
        }
      }
    }
    return out;
  }

  /**
   * Reports position, and scrobbles once past the watched mark.
   *
   * These two endpoints are Plex's long-standing timeline API rather than
   * anything documented for third parties, so they are the part of this most
   * likely to need adjusting - hence both are best effort and log rather than
   * throw upward into a playing video.
   */
  /**
   * Items already scrobbled, so the mark happens once per viewing.
   *
   * A report arrives every ten seconds while a video plays, and everything
   * past WATCHED_FRACTION counts as watched - so without this the last tenth
   * of every file re-scrobbles and re-logs on every tick. Cleared when a
   * report comes in below the mark, which is what re-watching looks like.
   */
  private markedWatched = new Set<string>();

  async reportPlayback(
    itemId: string,
    { positionSeconds, durationSeconds, serverPath }: PlaybackReport
  ): Promise<void> {
    const watched = durationSeconds > 0 && positionSeconds / durationSeconds >= WATCHED_FRACTION;
    // The progress report still goes every tick - that is the resume point.
    await this.request("/:/progress", {
      key: itemId,
      identifier: "com.plexapp.plugins.library",
      time: String(Math.floor(positionSeconds * 1000)),
      state: watched ? "stopped" : "playing",
    });
    if (!watched) {
      this.markedWatched.delete(itemId);
      return;
    }
    if (this.markedWatched.has(itemId)) {
      return;
    }
    await this.request("/:/scrobble", { key: itemId, identifier: "com.plexapp.plugins.library" });
    this.markedWatched.add(itemId);
    logger.log("info", `Marked "${serverPath}" watched on Plex.`);
  }
}
