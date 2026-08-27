import { DfContentEntry, logger, secondsToHHMMSS } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";
import { Chapter } from "../chatpers.js";
import { fetchYtVideoMeta } from "./chapters.js";
import { moveSponsorshipToEnd } from "./sponsorship.js";

export type SyncYtVideoMetaResult = {
  entry: DfContentEntry;
  chapters: Chapter[] | null;
  /**
   * YouTube's own duration for the video, as opposed to the (possibly
   * shorter) downloaded file's. Callers that have measured the real file
   * need both to work out what DF cut out of it - see sponsorship.ts.
   */
  ytDurationSeconds: number | null;
};

/**
 * Fetches YouTube metadata for a content entry and backfills
 * description/duration into the DB - Digital Foundry's own listing never
 * carries either field (see docs/DF_SITE_MIGRATION.md), so both are only
 * ever sourced from here. Two different callers, two different needs
 * around `alwaysFetch`:
 * - Lazy (the default, `alwaysFetch: false`): dialog open, or an
 *   auto-download candidate's exclusion-filter check. Skips the YouTube
 *   fetch entirely once both fields are already cached - most content is
 *   never opened or filtered on, so there's no reason to hit YouTube for it.
 * - Always (`alwaysFetch: true`): download completion, alongside chapter
 *   extraction. Chapters aren't persisted anywhere - they're embedded fresh
 *   into each downloaded file - so this needs a live fetch every time
 *   regardless of whether description/duration happen to already be
 *   cached from an earlier dialog open or auto-download check. The DB
 *   write itself is still skipped if there's nothing new to save.
 */
export const syncYtVideoMeta = async (
  db: DfDownloaderOperationalDb,
  contentKey: string,
  opts: { alwaysFetch?: boolean } = {}
): Promise<SyncYtVideoMetaResult | undefined> => {
  const entry = await db.getContentEntry(contentKey);
  if (!entry) {
    return undefined;
  }
  const { contentInfo } = entry;
  const videoId = contentInfo.youtubeVideoId;
  if (!videoId) {
    return { entry, chapters: null, ytDurationSeconds: null };
  }
  const hasDescription = Boolean(contentInfo.description?.trim());
  const existingDuration = contentInfo.mediaInfo.find((mediaInfo) => mediaInfo.duration)?.duration;
  if (!opts.alwaysFetch && hasDescription && existingDuration) {
    return { entry, chapters: null, ytDurationSeconds: null };
  }
  logger.log("info", `Fetching YouTube metadata for ${contentKey}`);
  const ytMeta = await fetchYtVideoMeta(videoId).catch((e) => {
    logger.log("error", `Failed to fetch YouTube metadata for ${contentKey}`, e);
    return null;
  });
  if (!ytMeta) {
    return { entry, chapters: null, ytDurationSeconds: null };
  }
  const durationString = existingDuration || (ytMeta.durationSeconds != null ? secondsToHHMMSS(ytMeta.durationSeconds) : undefined);
  const rawDescription = hasDescription ? contentInfo.description : ytMeta.description || contentInfo.description;
  // YouTube descriptions open with a sponsor credit for the read that DF cut
  // out of the downloadable file, so it's not really about the video -
  // demote it to the end rather than dropping it. Applied to whichever
  // description we end up keeping, not just a freshly fetched one, so
  // entries backfilled before this existed get tidied as they're re-synced;
  // the move is idempotent, since a blurb already at the end is no longer in
  // the leading paragraphs it looks at.
  const newDescription = rawDescription ? moveSponsorshipToEnd(rawDescription) : rawDescription;
  // Duration is a property of the video, not any particular
  // format/container, so the same value applies uniformly to every format -
  // only fills in ones that don't already have one (e.g. a format added
  // after an earlier fetch already resolved this). Crucially this never
  // overwrites: once a file has been downloaded and ffprobed, that
  // measurement is the real length and YouTube's - which still includes the
  // sponsorship segment - must not clobber it.
  const missingSomeDuration = contentInfo.mediaInfo.some((mediaInfo) => !mediaInfo.duration && durationString);
  let updatedContentInfo = contentInfo;
  if (newDescription !== contentInfo.description || missingSomeDuration) {
    updatedContentInfo = {
      ...contentInfo,
      description: newDescription,
      mediaInfo: contentInfo.mediaInfo.map((mediaInfo) =>
        mediaInfo.duration
          ? mediaInfo
          : {
              ...mediaInfo,
              duration: durationString,
              durationSource: durationString ? ("youtube" as const) : mediaInfo.durationSource,
            }
      ),
    };
    await db.setContentInfo(updatedContentInfo);
  }
  return {
    entry: { ...entry, contentInfo: updatedContentInfo },
    chapters: ytMeta.chapters,
    ytDurationSeconds: ytMeta.durationSeconds,
  };
};
