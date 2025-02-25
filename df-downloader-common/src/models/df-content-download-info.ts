import { z } from "zod";
import { MediaInfo } from "./media-info.js";

export const DfContentSubtitleInfo = z.object({
  language: z.string(),
  service: z.string(),
});
export type DfContentSubtitleInfo = z.infer<typeof DfContentSubtitleInfo>;

export const DfContentDownloadInfo = z.object({
  downloadDate: z.coerce.date(),
  downloadLocation: z.string(),
  mediaInfo: MediaInfo,
  size: z.string().optional(),
  subtitles: DfContentSubtitleInfo.array().optional(),
});
export type DfContentDownloadInfo = z.infer<typeof DfContentDownloadInfo>;

export const DeleteDownloadRequest = z.object({
  contentName: z.string(),
  downloadLocation: z.string(),
});
export type DeleteDownloadRequest = z.infer<typeof DeleteDownloadRequest>;
