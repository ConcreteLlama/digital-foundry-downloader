import { DfContentEntry, SrtLine, logger } from "df-downloader-common";
import fs from "fs";
import { inferTranscriptPath } from "../../media-utils/subtitles/transcript-backfill.js";
import { parseSrt } from "../../media-utils/subtitles/srt-utils.js";
import { extractMediaSubtitles } from "../media-metadata.js";

export type ResolvedTranscript = {
  text: string;
  /** Where it came from, for logging - not stored on the result. */
  source: "sidecar" | "inferred_sidecar" | "embedded";
};

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
export const srtLinesToText = (lines: SrtLine[]): string => {
  const parts: string[] = [];
  let previous = "";
  for (const line of lines) {
    const text = line.transcript?.replace(/\s+/g, " ").trim();
    if (!text || text === previous) {
      continue;
    }
    parts.push(text);
    previous = text;
  }
  return parts.join(" ");
};

const readSrtFile = async (path: string): Promise<string | undefined> => {
  try {
    const raw = await fs.promises.readFile(path, { encoding: "utf-8" });
    const text = srtLinesToText(parseSrt(raw));
    return text || undefined;
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
      const text = await readSrtFile(subtitle.path);
      if (text) {
        return { text, source: "sidecar" };
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
        const text = await readSrtFile(inferred);
        if (text) {
          return { text, source: "inferred_sidecar" };
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
      const text = srtLinesToText(lines);
      if (text) {
        return { text, source: "embedded" };
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
