import { DfContentEntry, DfContentSubtitleInfo, logger } from "df-downloader-common";
import fs from "fs";
import path from "path";
import { languageToSubsLanguage } from "./srt-utils.js";

/**
 * Fills in where an existing entry's transcript is, for downloads recorded
 * before the path was stored.
 *
 * Inference is deliberately self-verifying rather than authoritative: it
 * derives the name writeSubtitleSidecar would have used and records it ONLY if
 * that file is actually on disk. Files move (Tools > Reorganize Files) and the
 * filename template is user-configurable, so a derived path is a guess - a
 * guess that has been checked is fine to store, one that has not is a lie that
 * will later show a broken link.
 *
 * Lazy on purpose. Walking the whole library at startup to stat a file per
 * download would be a lot of disk work for a cosmetic field, so this runs when
 * an entry is actually looked at.
 */
export const inferTranscriptPath = async (
  downloadLocation: string,
  subtitle: DfContentSubtitleInfo
): Promise<string | undefined> => {
  const dir = path.dirname(downloadLocation);
  const base = path.basename(downloadLocation, path.extname(downloadLocation));
  const language = languageToSubsLanguage(subtitle.language) || subtitle.language;
  const candidate = path.join(dir, `${base}.${language}.srt`);
  try {
    await fs.promises.access(candidate, fs.constants.R_OK);
    return candidate;
  } catch {
    return undefined;
  }
};

/**
 * Returns the subtitle entries that gained a path, or an empty array if
 * nothing changed - so callers can skip a DB write in the common case.
 */
export const backfillTranscriptPaths = async (
  entry: DfContentEntry
): Promise<{ downloadLocation: string; subtitle: DfContentSubtitleInfo }[]> => {
  const found: { downloadLocation: string; subtitle: DfContentSubtitleInfo }[] = [];
  for (const download of entry.downloads) {
    for (const subtitle of download.subtitles ?? []) {
      if (subtitle.path) {
        continue;
      }
      const inferred = await inferTranscriptPath(download.downloadLocation, subtitle);
      if (inferred) {
        logger.log("debug", `Found existing transcript for ${entry.key} at ${inferred}`);
        found.push({ downloadLocation: download.downloadLocation, subtitle: { ...subtitle, path: inferred } });
      }
    }
  }
  return found;
};
