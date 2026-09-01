import { Chapter, DfContentEntry, logger } from "df-downloader-common";
import { fileExists } from "../file-utils.js";
import { extractBaseMetadata } from "../media-metadata.js";
import { fetchYtVideoMeta } from "../youtube/chapters.js";

/**
 * The chapter list for a downloaded item, read out of the file itself.
 *
 * Chapters are muxed into every download and deliberately never persisted to
 * the database, so the file is the only place they exist afterwards - but it
 * is a complete place, and reading them back is a local ffprobe rather than
 * anything that touches YouTube.
 *
 * Worth having for analysis because chapter titles are written by Digital
 * Foundry rather than transcribed, so the names in them are spelt correctly
 * where a machine transcript garbles exactly that. For a Direct they are
 * effectively the segment list - the thing the per-item breakdown is trying
 * to reconstruct - and they are just as useful on the cheap path, where there
 * is no transcript to work from at all.
 *
 * Returns undefined rather than throwing for anything not downloaded, not
 * readable, or simply without chapters: all three are ordinary states.
 */
export const resolveChapters = async (
  entry: DfContentEntry,
  /**
   * Allow one YouTube request when the file has none.
   *
   * Off by default, and deliberately so: the case with no file is content
   * that was never downloaded, which is precisely the case a whole-library
   * tagging run is made of - so defaulting this on would quietly attach a
   * YouTube request to each of several hundred items. Enabled only where a
   * person is waiting on a single item.
   */
  allowRemote = false
): Promise<Chapter[] | undefined> => {
  for (const download of entry.downloads ?? []) {
    const path = download.downloadLocation;
    if (!path || !(await fileExists(path))) {
      continue;
    }
    const meta = await extractBaseMetadata(path, true).catch((e) => {
      logger.log("debug", `Could not read chapters from ${path}: ${e}`);
      return undefined;
    });
    if (meta?.chapters?.length) {
      return meta.chapters;
    }
  }

  const videoId = entry.contentInfo.youtubeVideoId;
  if (!allowRemote || !videoId) {
    return undefined;
  }
  // One request, which also carries duration and description - see
  // fetchYtVideoMeta. Failure is not worth surfacing: chapters are a bonus
  // here, and an analysis without them is what every analysis was until now.
  const remote = await fetchYtVideoMeta(videoId).catch((e) => {
    logger.log("debug", `Could not fetch chapters for ${entry.key} from YouTube: ${e}`);
    return null;
  });
  return remote?.chapters?.length ? remote.chapters : undefined;
};
