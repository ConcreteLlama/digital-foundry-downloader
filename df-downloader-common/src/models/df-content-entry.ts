import { z } from "zod";
import { DfContentDownloadInfo } from "./df-content-download-info.js";
import { DfContentInfo, DfContentInfoUtils } from "./df-content-info.js";
import { DfContentAvailabilityInfo } from "./df-content-status.js";
import { MediaInfo } from "./media-info/media-info.js";
import { AiAnalysisResult } from "./ai-analysis.js";

export const DfContentEntry = z.object({
  /** Mirrors the DB record's key (see DfContentInfo.key) - not the pretty contentInfo.name. */
  key: z.string(),
  contentInfo: DfContentInfo,
  statusInfo: DfContentAvailabilityInfo,
  downloads: DfContentDownloadInfo.array(),
  /**
   * The most recent AI analysis of this content, when one has been run.
   *
   * Optional and additive: every entry already in the DB parses unchanged,
   * so no migration step is needed. Absent means "never analysed", which is
   * the normal state for most of the library - analysis is opt-in, costs
   * real money per item, and is never run across the archive implicitly.
   */
  aiAnalysis: AiAnalysisResult.optional(),
});
export type DfContentEntry = z.infer<typeof DfContentEntry>;

export type DfContentEntryCreate = Omit<DfContentEntry, "downloads">;
export type DfContentEntryUpdate = Partial<DfContentEntryCreate> & {
  key: string;
};

export const DfContentEntryUtils = {
  create: (key: string, contentInfo: DfContentInfo, statusInfo: DfContentAvailabilityInfo): DfContentEntry => ({
    key,
    contentInfo,
    statusInfo,
    downloads: [],
  }),
  hasDownload: (entry: DfContentEntry): boolean => {
    return entry.downloads.length > 0;
  },
  getDownloadForFormat: (entry: DfContentEntry, format: string): DfContentDownloadInfo | undefined => {
    return entry.downloads.find((d) => d.mediaInfo.formatString === format);
  },
  getTotalDuration: (dfContentEntries: DfContentEntry[]): number => {
    return DfContentInfoUtils.getTotalDuration(dfContentEntries.map((dfContentEntry) => dfContentEntry.contentInfo));
  },
};

export const isContentEntry = (contentInfo: DfContentInfo | DfContentEntry): contentInfo is DfContentEntry => {
  return Boolean((contentInfo as DfContentEntry).contentInfo);
};
