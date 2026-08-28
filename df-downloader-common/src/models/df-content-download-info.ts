import { z } from "zod";
import { MediaInfo } from "./media-info/media-info.js";

export const DfContentSubtitleInfo = z.object({
  language: z.string(),
  service: z.string(),
  /**
   * Where the .srt actually is on disk, when one exists.
   *
   * Optional and additive on purpose: every entry already in the DB parses
   * unchanged, so no migration is needed. It is genuinely absent rather than
   * merely unknown in the common case - with the default "auto" output mode a
   * fresh download EMBEDS its subtitles while assembling the file and never
   * writes a sidecar at all (see resolveSubtitlesOutput). Turn on
   * subtitles.keepTranscript to get one regardless.
   *
   * Never inferred and stored blindly: files move (Tools > Reorganize Files)
   * and the filename template is user-configurable, so a derived path is only
   * recorded after checking the file is really there.
   */
  path: z.string().optional(),
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
