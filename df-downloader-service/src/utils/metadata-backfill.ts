import { DfContentEntry, MediaFileMeta, MetadataBackfillOptions, logger } from "df-downloader-common";
import { serviceLocator } from "../services/service-locator.js";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { probeMediaDurationSeconds } from "./media-metadata.js";
import { applySponsorSegmentToChapters, resolveSponsorSegment } from "./youtube/sponsorship.js";
import { fetchYtVideoMeta } from "./youtube/chapters.js";

/**
 * Everything a metadata rewrite should embed, gathered in one pass.
 *
 * Gathering is separate from writing because the write is the expensive part:
 * whatever sources are selected are collected first and written once, rather
 * than rewriting a multi-gigabyte file per source.
 *
 * Subtitles are deliberately not supplied. Injection copies the streams
 * already in the file, so leaving this out preserves embedded subtitles;
 * passing them would re-encode a track that is already there.
 */
export const buildMetadataForBackfill = async (
  entry: DfContentEntry,
  options: MetadataBackfillOptions
): Promise<{ meta: MediaFileMeta; downloadLocation: string } | null> => {
  const download = entry.downloads?.find((candidate) => candidate.mediaInfo.type === "VIDEO") ?? entry.downloads?.[0];
  if (!download?.downloadLocation) {
    return null;
  }

  let { description, tags } = entry.contentInfo;
  let chapters = null;

  if (options.fromYouTube && entry.contentInfo.youtubeVideoId) {
    const remote = await fetchYtVideoMeta(entry.contentInfo.youtubeVideoId).catch((e) => {
      logger.log("warn", `Could not fetch YouTube metadata for ${entry.key}: ${e}`);
      return null;
    });
    description = description || remote?.description || undefined;
    /*
     * Realigned exactly as a fresh download would be, rather than embedded
     * raw. YouTube's chapters describe YouTube's cut of the video; where the
     * sponsor read was removed, those timings are wrong from the second
     * chapter onwards and the sponsor marker itself describes content that is
     * not in the file. Anything downloaded before that realignment existed
     * still carries both faults, which is most of the reason to run this.
     */
    if (remote?.chapters?.length) {
      const measuredDurationSeconds = await probeMediaDurationSeconds(download.downloadLocation).catch(() => null);
      const resolution = resolveSponsorSegment({
        chapters: remote.chapters,
        ytDurationSeconds: remote.durationSeconds,
        measuredDurationSeconds,
        label: entry.contentInfo.name || entry.key,
      });
      chapters =
        resolution.kind === "located"
          ? applySponsorSegmentToChapters(
              remote.chapters,
              resolution.segment,
              measuredDurationSeconds ? measuredDurationSeconds * 1000 : undefined
            )
          : remote.chapters;
    }
  }

  if (options.fromAnalysis) {
    // Only what was accepted, matching what is written to the content itself -
    // a suggestion awaiting review is not a fact about the file.
    const analysis = await serviceLocator.db.getAiAnalysis(entry.contentInfo.key).catch(() => undefined);
    const accepted = (analysis?.tags ?? []).filter((tag) => tag.status === "accepted").map((tag) => tag.tag);
    const existing = tags ?? [];
    const existingLower = new Set(existing.map((tag) => tag.toLowerCase()));
    tags = [...existing, ...accepted.filter((tag) => !existingLower.has(tag.toLowerCase()))];
  }

  return {
    meta: makeMediaFileMeta({ ...entry.contentInfo, description, tags }, null, chapters),
    downloadLocation: download.downloadLocation,
  };
};
