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
  refreshPath(serverPath: string): Promise<void>;

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
