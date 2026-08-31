import { PlaybackInfo, parseResponseBody } from "df-downloader-common";
import { API_URL } from "../config.ts";
import { fetchJson } from "../utils/fetch.ts";

/**
 * URLs for the playback endpoints.
 *
 * These are handed straight to a `<video src>` and a `<track src>` rather
 * than fetched, so they have to be absolute against API_URL - in dev the UI
 * is served by Vite on another origin entirely. That also means the element
 * needs crossOrigin="use-credentials" for the auth cookie to ride along; see
 * the player component.
 */
const playbackUrl = (contentKey: string, downloadLocation: string, suffix: string) =>
  `${API_URL}/playback/${encodeURIComponent(contentKey)}/${suffix}?${new URLSearchParams({ downloadLocation })}`;

export const getPlaybackInfo = async (contentKey: string, downloadLocation: string) => {
  const result = await fetchJson(playbackUrl(contentKey, downloadLocation, "info"), { method: "GET" });
  return parseResponseBody(result, PlaybackInfo).data;
};

export const playbackStreamUrl = (contentKey: string, downloadLocation: string) =>
  playbackUrl(contentKey, downloadLocation, "stream");

export const playbackSubtitlesUrl = (contentKey: string, downloadLocation: string, trackIndex: number) =>
  playbackUrl(contentKey, downloadLocation, `subtitles/${trackIndex}`);

/**
 * A subtitle stream inside the video file, extracted to WebVTT on request.
 *
 * Separate from the sidecar route because the index means a different thing:
 * there it is a position in the download's subtitle list, here it is an
 * ffmpeg stream index - see PlaybackSubtitleTrack.source.
 */
export const playbackEmbeddedSubtitlesUrl = (
  contentKey: string,
  downloadLocation: string,
  streamIndex: number
) => playbackUrl(contentKey, downloadLocation, `embedded-subtitles/${streamIndex}`);

/**
 * Whether the API is on a different origin to the page.
 *
 * This decides whether the player sets `crossOrigin`, and it has to be
 * conditional rather than always-on. Setting `crossOrigin` makes the browser
 * fetch the video's POSTER through CORS too, and the poster is one of
 * Digital Foundry's own thumbnails - served from a host that sends no CORS
 * headers at all, so it fails to load and the player falls back to a black
 * rectangle. Confirmed directly: the same thumbnail URL loads in a plain
 * <img> and fails with crossOrigin set to either "anonymous" or
 * "use-credentials".
 *
 * Same-origin is the normal case and needs no CORS: the dev server proxies
 * /api (see vite.config.ts), and a built image serves the UI from the
 * service itself. It is only cross-origin when the app is reached through a
 * different hostname than the configured public address - a reverse proxy,
 * typically - and there the auth cookie genuinely does need credentials
 * mode on the media and subtitle requests, at the cost of the poster.
 */
export const apiIsCrossOrigin = (): boolean => {
  try {
    return new URL(API_URL, window.location.href).origin !== window.location.origin;
  } catch {
    // A malformed or relative-in-an-odd-way API_URL is not a reason to break
    // playback; same-origin is both the common case and the safe assumption.
    return false;
  }
};

