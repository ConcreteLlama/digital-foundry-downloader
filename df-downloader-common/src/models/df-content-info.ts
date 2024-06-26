import { z } from "zod";
import { MediaInfo, MediaInfoUtils } from "./media-info.js";
import { sanitizeFileName } from "../utils/file-utils.js";

export const DfContentInfo = z
  .object({
    publishedDate: z.coerce.date(),
    name: z.string(),
    title: z.string(),
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    youtubeVideoId: z.string().optional(),
    mediaInfo: z.array(MediaInfo),
    dataPaywalled: z.boolean(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export type DfContentInfo = z.infer<typeof DfContentInfo>;

export const DfContentInfoUtils = {
  create: (
    name: string,
    title: string,
    description: string | undefined,
    mediaInfo: MediaInfo[],
    thumbnailUrl: string,
    youtubeVideoId: string | undefined,
    dataPaywalled: boolean,
    publishedDate?: Date,
    tags?: string[]
  ): DfContentInfo => ({
    name,
    title,
    description,
    mediaInfo,
    thumbnailUrl,
    youtubeVideoId,
    dataPaywalled,
    tags: tags || [],
    publishedDate: publishedDate || DfContentInfoUtils.extractDateFromName(name) || new Date(),
  }),
  extractDateFromName(name: string) {
    const dateStr = name.substring(0, "0000-00-00".length);
    return new Date(Date.parse(dateStr));
  },
  getTotalDuration(dfContents: DfContentInfo[]) {
    return dfContents.reduce(
      (toReturn, dfContentInfo) => (toReturn += MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo)),
      0
    );
  },
  makeFileName(dfContentInfo: DfContentInfo, mediaInfo: MediaInfo, includeFormat: boolean = true) {
    const extension = mediaInfo.mediaType === "MP3" ? "mp3" : "mp4";
    const format = includeFormat ? `_${mediaInfo.mediaType}` : "";
    return `${sanitizeFileName(`${dfContentInfo.name}${format}`)}.${extension}`;
  },
  getThumbnailUrl(dfContentInfo: DfContentInfo, width: number, height?: number) {
    return this.thumbnailUrlToSize(dfContentInfo.thumbnailUrl || "", width, height);
  },
  thumbnailUrlToSize(thumbnailUrl: string, width: number, height?: number) {
    height = height ? height : Math.floor((width * 9) / 16);
    return (thumbnailUrl || "").replace(/\/thumbnail\/.*\//, `/thumbnail/${width}x${height}/`);
  },
  getDurationSeconds(dfContentInfo: DfContentInfo) {
    return MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo);
  },
  getMediaInfo(dfContentInfo: DfContentInfo, mediaType: string) {
    return dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.mediaType === mediaType);
  },
};
