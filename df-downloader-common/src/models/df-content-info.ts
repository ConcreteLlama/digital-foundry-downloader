import { z } from "zod";
import { MediaInfo, MediaInfoUtils } from "./media-info.js";

export const DfContentInfo = z
  .object({
    publishedDate: z.coerce.date(),
    name: z.string(),
    title: z.string(),
    description: z.string().optional(),
    thumbnailUrl: z.string().optional(),
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
    dataPaywalled: boolean,
    publishedDate?: Date,
    tags?: string[]
  ): DfContentInfo => ({
    name,
    title,
    description,
    mediaInfo,
    thumbnailUrl,
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
  makeFileName(dfContentInfo: DfContentInfo, mediaInfo: MediaInfo) {
    const extension = mediaInfo.mediaType === "MP3" ? "mp3" : "mp4";
    return `${dfContentInfo.name}.${extension}`;
  },
  getThumbnailUrl(dfContentInfo: DfContentInfo, width: number, height?: number) {
    height = height ? height : Math.floor((width * 9) / 16);
    return (dfContentInfo.thumbnailUrl || "").replace(/\/thumbnail\/.*\//, `/thumbnail/${width}x${height}/`);
  },
  getDurationSeconds(dfContentInfo: DfContentInfo) {
    return MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo);
  },
};
