import { z } from "zod";
import { Chapter } from "./chapter.js";

/**
 * A subtitle track the browser can actually be handed.
 *
 * Only sidecar .srt files make this list, and that is a measured limit
 * rather than a conservative one: a track muxed into the container is not
 * exposed to `<video>` at all (a file carrying one reports
 * `textTracks.length === 0`), and the tracks this app embeds are muxed as
 * an mp4 `bin_data` stream rather than a real subtitle stream, so there is
 * nothing for a player to find even in principle. See
 * `embeddedSubtitlesOnly` for how that case is reported instead.
 */
export const PlaybackSubtitleTrack = z.object({
  /**
   * What `index` addresses, and which endpoint serves this track.
   *
   * A sidecar is a file beside the video; an embedded track is a stream
   * inside it. Browsers can read neither directly - the first is SRT, the
   * second is not reachable at all - so both are converted to WebVTT on the
   * way out, just from different sources.
   *
   * Defaulted so tracks stored or sent before this existed still parse, and
   * as sidecars because that is all there was.
   */
  source: z.enum(["sidecar", "embedded"]).default("sidecar"),
  /**
   * For a sidecar, its position in the download's own `subtitles` array. For
   * an embedded track, ffmpeg's stream index within the file. Either way an
   * opaque number, so no filename ever crosses the wire from the client.
   */
  index: z.number().int(),
  language: z.string(),
  /** What the browser's own subtitle menu shows, e.g. "English". */
  label: z.string(),
});
export type PlaybackSubtitleTrack = z.infer<typeof PlaybackSubtitleTrack>;

/**
 * The video codec as ffprobe reports it for the file itself, which is not
 * always what `MediaInfo.encoding` says - that comes from Digital
 * Foundry's listing, this comes from the bytes on disk.
 */
export const PlaybackVideoCodec = z.enum(["h264", "hevc", "other"]);
export type PlaybackVideoCodec = z.infer<typeof PlaybackVideoCodec>;

/**
 * Everything the player needs before it points a `<video>` at a file.
 *
 * Deliberately one request: the same single ffprobe that reads the chapters
 * back out of the file also reports its codec and duration, so splitting
 * these apart would mean probing a multi-gigabyte file more than once to
 * open it.
 */
export const PlaybackInfo = z.object({
  contentKey: z.string(),
  /** Echoed back from the DB record, not from the request. */
  downloadLocation: z.string(),
  mimeType: z.string(),
  videoCodec: PlaybackVideoCodec,
  /**
   * A representative RFC 6381 type string for `canPlayType()`, e.g.
   * `video/mp4; codecs="hvc1.1.6.L93.B0"`.
   *
   * Representative, not exact - it answers "does this browser decode this
   * codec family at all", which is the question that actually decides
   * whether playback works. Browser HEVC support is a platform-level
   * all-or-nothing thing (the OS either supplies a decoder or it does not),
   * not something that varies by the profile/level of one 4K file. It is
   * also only ever a pre-check: the `<video>` element's own `error` event
   * is what finally decides, so an optimistic probe still degrades into the
   * open-externally path rather than a silent black rectangle.
   *
   * Worth knowing that the string has to be specific to be useful at all -
   * a bare `codecs="hvc1"` returns "not supported" from a browser that
   * decodes `hvc1.1.6.L93.B0` perfectly well.
   */
  codecProbe: z.string().optional(),
  sizeBytes: z.number(),
  /** Measured from the file, so it excludes anything trimmed from the YouTube cut. */
  durationSeconds: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** Read back out of the file at request time - chapters are never persisted. */
  chapters: Chapter.array(),
  subtitleTracks: PlaybackSubtitleTrack.array(),
  /**
   * True when the file has subtitles but none that can be served to a
   * browser - i.e. they were embedded and no .srt was kept alongside. Lets
   * the player say why there are no captions instead of just not having any.
   */
  embeddedSubtitlesOnly: z.boolean(),
});
export type PlaybackInfo = z.infer<typeof PlaybackInfo>;

