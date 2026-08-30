import { DfContentEntry, SrtLine, SrtTimestamp, logger } from "df-downloader-common";
import fs from "fs";
import { inferTranscriptPath } from "../../media-utils/subtitles/transcript-backfill.js";
import { parseSrt } from "../../media-utils/subtitles/srt-utils.js";
import { extractMediaSubtitles } from "../media-metadata.js";

/** Where one cue's text starts within the flattened transcript. */
export type TranscriptCueOffset = {
  /** Character index into ResolvedTranscript.text. */
  offset: number;
  startSeconds: number;
};

export type ResolvedTranscript = {
  text: string;
  /** Where it came from, for logging - not stored on the result. */
  source: "sidecar" | "inferred_sidecar" | "embedded";
  /**
   * Cue boundaries within `text`, ascending, so a span of the transcript
   * can be turned back into a time. This is what makes a quoted finding
   * locatable - see locateQuote.
   */
  offsets: TranscriptCueOffset[];
};

const srtTimestampToSeconds = (t: SrtTimestamp): number =>
  t.hours * 3600 + t.minutes * 60 + t.seconds + t.milliseconds / 1000;

/**
 * Turns subtitle cues into prose for the model.
 *
 * Timings are dropped deliberately. The analysis is about what was said,
 * not when, and cue boundaries are an artefact of subtitle display rather
 * than of speech - they routinely split mid-sentence, and feeding those
 * fragments in as if they were structure encourages the model to treat
 * each as a complete thought. Consecutive duplicate cues are collapsed
 * because subtitle tracks repeat a line across cues when it stays on
 * screen, and the repetition is noise that costs input tokens.
 */
export const srtLinesToTextWithOffsets = (lines: SrtLine[]): { text: string; offsets: TranscriptCueOffset[] } => {
  const parts: string[] = [];
  const offsets: TranscriptCueOffset[] = [];
  let previous = "";
  let offset = 0;
  for (const line of lines) {
    const text = line.transcript?.replace(/\s+/g, " ").trim();
    if (!text || text === previous) {
      continue;
    }
    offsets.push({ offset, startSeconds: srtTimestampToSeconds(line.start) });
    parts.push(text);
    // +1 for the space join below, so offsets index into the joined string.
    offset += text.length + 1;
    previous = text;
  }
  return { text: parts.join(" "), offsets };
};

export const srtLinesToText = (lines: SrtLine[]): string => srtLinesToTextWithOffsets(lines).text;

/**
 * Turns a quoted span back into the moment it was said.
 *
 * Plain substring search, then a whitespace-and-punctuation-insensitive
 * retry - the model occasionally normalises an ellipsis or a dash even
 * when told not to, and that is a formatting difference rather than a
 * paraphrase. Anything beyond that is treated as not found: a quote that
 * has genuinely drifted is one that was invented, and guessing where it
 * might have been is exactly the failure this whole approach exists to
 * avoid.
 */
export const locateQuote = (transcript: ResolvedTranscript, quote: string): number | undefined => {
  const trimmed = quote?.trim();
  if (!trimmed || !transcript.offsets.length) {
    return undefined;
  }
  let index = transcript.text.indexOf(trimmed);
  if (index < 0) {
    const loosen = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const haystack = loosen(transcript.text);
    const needle = loosen(trimmed);
    if (!needle) {
      return undefined;
    }
    const looseIndex = haystack.indexOf(needle);
    if (looseIndex < 0) {
      return undefined;
    }
    // The loosened string collapses runs of punctuation, so its indices do
    // not line up with the original. Scale back proportionally - only ever
    // used to pick a cue, and cues are seconds long.
    index = Math.round((looseIndex / haystack.length) * transcript.text.length);
  }

  let startSeconds = transcript.offsets[0].startSeconds;
  for (const cue of transcript.offsets) {
    if (cue.offset > index) {
      break;
    }
    startSeconds = cue.startSeconds;
  }
  return startSeconds;
};

const readSrtFile = async (
  path: string
): Promise<{ text: string; offsets: TranscriptCueOffset[] } | undefined> => {
  try {
    const raw = await fs.promises.readFile(path, { encoding: "utf-8" });
    const parsed = srtLinesToTextWithOffsets(parseSrt(raw));
    return parsed.text ? parsed : undefined;
  } catch (e) {
    logger.log("warn", `Could not read transcript at ${path}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
};

/**
 * Finds a transcript for a downloaded item, if one exists anywhere.
 *
 * Three sources, cheapest first. The order matters less than the fact that
 * there are three: with the default "auto" subtitles output a fresh
 * download EMBEDS its subtitles and never writes a .srt at all, so a
 * sidecar-only implementation would find nothing for exactly the content
 * most likely to have been transcribed. Equally, an install that writes
 * sidecars has no reason to pay for an ffmpeg pass over a multi-gigabyte
 * file. Both are normal configurations, so both are handled.
 *
 * Returns undefined rather than throwing when there is no transcript -
 * that is an ordinary state, not an error. Tagging still runs from the
 * title and description in that case.
 */
export const resolveTranscript = async (entry: DfContentEntry): Promise<ResolvedTranscript | undefined> => {
  for (const download of entry.downloads) {
    for (const subtitle of download.subtitles ?? []) {
      if (!subtitle.path) {
        continue;
      }
      const parsed = await readSrtFile(subtitle.path);
      if (parsed) {
        return { ...parsed, source: "sidecar" };
      }
    }
  }

  // Recorded subtitles with no stored path, or downloads predating the
  // path being stored at all - derive where the sidecar would be and use
  // it only if it is really there (see transcript-backfill.ts).
  for (const download of entry.downloads) {
    for (const subtitle of download.subtitles ?? []) {
      if (subtitle.path) {
        continue;
      }
      const inferred = await inferTranscriptPath(download.downloadLocation, subtitle);
      if (inferred) {
        const parsed = await readSrtFile(inferred);
        if (parsed) {
          return { ...parsed, source: "inferred_sidecar" };
        }
      }
    }
  }

  for (const download of entry.downloads) {
    try {
      await fs.promises.access(download.downloadLocation, fs.constants.R_OK);
    } catch {
      continue;
    }
    try {
      const lines = await extractMediaSubtitles(download.downloadLocation);
      const parsed = srtLinesToTextWithOffsets(lines);
      if (parsed.text) {
        return { ...parsed, source: "embedded" };
      }
    } catch (e) {
      // Expected whenever the file simply has no subtitle track, which is
      // most of them - ffmpeg exits non-zero for "no such stream". Logged
      // at debug rather than warn so it does not read as a fault.
      logger.log(
        "debug",
        `No embedded subtitles in ${download.downloadLocation}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return undefined;
};
