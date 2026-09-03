import { MediaServerLibrary } from "df-downloader-common";
import { MediaServerType } from "df-downloader-common/config/media-servers-config.js";

export type MediaServerTestResult =
  | { ok: true; detail: string; libraries?: MediaServerLibrary[] }
  | { ok: false; error: string };

/**
 * One media server this app can tell about changed files.
 *
 * Deliberately not a `DfNotificationConsumer`. That interface is for telling a
 * person something - it carries password resets and sign-in state - and a
 * library refresh is an action against a machine. Implementing it here would
 * mean stubbing nine methods to do nothing.
 */
export interface MediaServerClient {
  readonly type: MediaServerType;

  /**
   * Tell the server that a directory's contents changed.
   *
   * Takes a path already translated into the server's own namespace - the
   * manager owns mapping, so a client never sees this app's paths.
   *
   * Best-effort by contract: a media server being down, or an endpoint not
   * existing on that version, must not fail a download. Implementations throw
   * and the manager logs; nothing upstream depends on this succeeding.
   */
  refreshPath(serverPath: string, reason?: string): Promise<void>;

  /**
   * Check the URL and credentials without changing anything.
   *
   * Exists because the rest of this feature is invisible when misconfigured -
   * a wrong path mapping or a stale token produces a request that succeeds and
   * does nothing. Mirrors the Test Session ID button, which was added for the
   * same reason.
   */
  testConnection(): Promise<MediaServerTestResult>;
}

/**
 * How far through counts as watched.
 *
 * Re-exported rather than redefined: this app now keeps its own watch state,
 * and two constants for one rule is exactly how a file ends up watched here
 * and unwatched there.
 */
export { WATCHED_FRACTION } from "df-downloader-common";

export type PlaybackReport = {
  positionSeconds: number;
  durationSeconds: number;
  /**
   * The path in the server's namespace, carried purely so the log line can
   * name the file. An item id alone says nothing to anyone reading a log.
   */
  serverPath: string;
};

/**
 * A server that can be told what you watched, as opposed to merely that a file
 * changed.
 *
 * Separate from MediaServerClient because it is a genuinely different
 * capability with a different credential. Announcing a changed folder is a
 * server-level action an API key can perform; play state belongs to a person,
 * and recent Jellyfin versions reject played-status writes made with an API
 * key outright. A client that cannot do this simply does not implement it.
 */
export interface PlayStateWriter {
  /**
   * The server's own id for the file at this path, or null if it has no such
   * item.
   *
   * Takes a path already in the server's namespace - the manager owns mapping.
   * Null is an ordinary answer, not an error: the server may not have scanned
   * the file yet, which is likely for something downloaded moments ago.
   */
  resolveItemId(serverPath: string): Promise<string | null>;

  /** Record where you got to, and mark it watched once past WATCHED_FRACTION. */
  reportPlayback(itemId: string, report: PlaybackReport): Promise<void>;
}

/** What a server says about one file. */
export type ServerPlayState = {
  watched: boolean;
  positionSeconds: number;
  durationSeconds?: number;
  /** When the server last saw it played, where it says. Drives the merge. */
  updatedAt?: Date;
};

/**
 * A server this app can ask what you have already watched.
 *
 * Deliberately bulk. Resolving a single path means reading a whole library
 * back and comparing file paths - neither server offers a lookup by path - so
 * a per-item version of this would re-read the entire library once per item.
 * One call, many paths, one library read.
 *
 * Separate from PlayStateWriter because reading and writing are not the same
 * permission on either server, and a client may sensibly do one and not the
 * other.
 */
export interface PlayStateReader {
  /**
   * Play state for each of these paths that the server knows about.
   *
   * Paths arrive already in the server's namespace - the manager owns mapping.
   * A path the server has never indexed is simply absent from the result,
   * which is an ordinary answer rather than an error.
   */
  readPlayState(serverPaths: string[]): Promise<Map<string, ServerPlayState>>;
}

export const canReadPlayState = (
  client: MediaServerClient
): client is MediaServerClient & PlayStateReader =>
  typeof (client as Partial<PlayStateReader>).readPlayState === "function";

export const canWritePlayState = (
  client: MediaServerClient
): client is MediaServerClient & PlayStateWriter =>
  typeof (client as Partial<PlayStateWriter>).resolveItemId === "function" &&
  typeof (client as Partial<PlayStateWriter>).reportPlayback === "function";
