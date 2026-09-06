import { SrtLine, SrtTimestamp } from "df-downloader-common";
import { parseSrt } from "./srt-utils.js";

/**
 * WebVTT conversion, for serving existing .srt sidecars to a `<video>`.
 *
 * A browser will not parse SRT - `<track kind="subtitles">` accepts WebVTT
 * and nothing else - so the sidecars this app already writes need
 * converting on the way out. Done on the fly rather than written to disk:
 * these files are tens of kilobytes (the largest in a real library here is
 * 63KB), so converting per request costs nothing measurable and avoids
 * putting a second subtitle file next to the video that the user never
 * asked for and that would go stale if the .srt were regenerated.
 *
 * Built on parseSrt rather than a text substitution over the raw file so
 * the two agree on what an SRT is - notably its CRLF handling, which was a
 * real bug (a whole CRLF file parsed as one cue) and would be easy to
 * reintroduce in a second parser.
 */

const formatVttTimestamp = ({ hours, minutes, seconds, milliseconds }: SrtTimestamp): string =>
  `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds.toString().padStart(3, "0").substring(0, 3)}`;

/**
 * WebVTT cue text is markup - `<i>`, `<c.classname>` and friends - so a
 * literal "<" in a transcript would start a tag that never closes and
 * swallow the rest of the cue. Whisper emits sound annotations in square
 * brackets rather than angle ones, but transcripts are user-editable and
 * term corrections are free text, so this cannot be assumed away.
 */
const escapeCueText = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Moves every cue earlier by `offsetSeconds`, dropping what falls before zero.
 *
 * For the transcoded playback path, where the stream is generated from a
 * chosen point and the element's timeline therefore starts at zero while the
 * cues are timed against the whole file. Without this, seeking to twenty
 * minutes in would show the subtitles from the start of the video.
 *
 * Cues that end before the new zero are dropped rather than clamped: a cue
 * pinned at 00:00 for the rest of the video is worse than no cue.
 */
const shiftSrtLines = (lines: SrtLine[], offsetSeconds: number): SrtLine[] => {
  if (!offsetSeconds) {
    return lines;
  }
  const toMs = ({ hours, minutes, seconds, milliseconds }: SrtTimestamp) =>
    hours * 3600000 + minutes * 60000 + seconds * 1000 + milliseconds;
  const fromMs = (ms: number): SrtTimestamp => ({
    hours: Math.floor(ms / 3600000),
    minutes: Math.floor(ms / 60000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
    milliseconds: Math.floor(ms % 1000),
  });
  const offsetMs = offsetSeconds * 1000;
  return lines.flatMap((line) => {
    const end = toMs(line.end) - offsetMs;
    if (end <= 0) {
      return [];
    }
    // A cue straddling the new zero keeps its end and starts at zero, so the
    // line being spoken as playback opens is actually shown.
    const start = Math.max(0, toMs(line.start) - offsetMs);
    return [{ ...line, start: fromMs(start), end: fromMs(end) }];
  });
};

export const srtLinesToVtt = (lines: SrtLine[], offsetSeconds = 0): string => {
  lines = shiftSrtLines(lines, offsetSeconds);
  const cues = lines.map(
    (line, index) =>
      `${index + 1}\n${formatVttTimestamp(line.start)} --> ${formatVttTimestamp(line.end)}\n${escapeCueText(
        line.transcript
      )}`
  );
  // A blank line after the header is required, not cosmetic - without it the
  // first cue is read as part of the header block and silently dropped.
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
};

export const srtToVtt = (srt: string, offsetSeconds = 0): string =>
  srtLinesToVtt(parseSrt(srt), offsetSeconds);
