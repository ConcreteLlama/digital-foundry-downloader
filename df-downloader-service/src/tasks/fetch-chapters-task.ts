import { DfContentInfo } from "df-downloader-common";
import { serviceLocator } from "../services/service-locator.js";
import { syncYtVideoMeta } from "../utils/youtube/sync-yt-video-meta.js";
import { applySponsorSegmentToChapters, resolveSponsorSegment } from "../utils/youtube/sponsorship.js";
import { taskify } from "../task-manager/utils.js";
import type { Chapter } from "../utils/chatpers.js";

export type FetchChaptersResult = {
  chapters: Chapter[] | null;
  description?: string;
};

/**
 * @param measuredDurationSeconds the downloaded file's real, ffprobe-measured
 * duration, when the caller has one. Without it there's no way to tell that
 * YouTube's chapters describe a longer video than the file on disk, so
 * they're passed through as-is.
 */
export const fetchChapters = async (
  contentInfo: DfContentInfo,
  measuredDurationSeconds?: number | null
): Promise<FetchChaptersResult> => {
  const videoId = contentInfo.youtubeVideoId;
  if (!videoId) {
    return { chapters: null, description: contentInfo.description };
  }
  // alwaysFetch: chapters are embedded fresh into every downloaded file
  // rather than persisted anywhere, so this needs a live YouTube fetch
  // regardless of whether description/duration happen to already be
  // cached (e.g. from an earlier dialog open or auto-download exclusion
  // check - see syncYtVideoMeta's doc comment). The description/duration
  // DB write itself is still skipped when there's nothing new to save.
  const result = await syncYtVideoMeta(serviceLocator.db, contentInfo.key, { alwaysFetch: true });
  const chapters = result?.chapters ?? null;
  const description = result?.entry.contentInfo.description ?? contentInfo.description;
  // DF's downloads have the sponsorship read cut out, so YouTube's chapter
  // timings run ahead of the file from that point on. Comparing YouTube's
  // duration against the real measured one tells us whether that happened
  // here, and the "Sponsored by ..." chapter tells us where.
  const resolution = resolveSponsorSegment({
    chapters,
    ytDurationSeconds: result?.ytDurationSeconds ?? null,
    measuredDurationSeconds: measuredDurationSeconds ?? null,
    label: contentInfo.name || contentInfo.key,
  });
  if (resolution.kind !== "located" || !chapters) {
    return { chapters, description };
  }
  return {
    chapters: applySponsorSegmentToChapters(
      chapters,
      resolution.segment,
      measuredDurationSeconds ? measuredDurationSeconds * 1000 : undefined
    ),
    description,
  };
};

export const FetchChaptersTask = taskify(fetchChapters, {
  taskType: "fetch_chapters",
});
