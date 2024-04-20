import { z } from "zod";

export const DfContentSubtitleInfo = z.object({
  language: z.string(),
  service: z.string(),
});
export type DfContentSubtitleInfo = z.infer<typeof DfContentSubtitleInfo>;

export const DfContentDownloadInfo = z.object({
  format: z.string(),
  downloadDate: z.coerce.date(),
  downloadLocation: z.string(),
  size: z.string().optional(),
  subtitles: DfContentSubtitleInfo.array().optional(),
});
export type DfContentDownloadInfo = z.infer<typeof DfContentDownloadInfo>;

export const DeleteDownloadRequest = z.object({
  contentName: z.string(),
  downloadLocation: z.string(),
});
export type DeleteDownloadRequest = z.infer<typeof DeleteDownloadRequest>;
