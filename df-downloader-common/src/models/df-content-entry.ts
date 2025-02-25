import { z } from "zod";
import { DfContentDownloadInfo } from "./df-content-download-info.js";
import { DfContentInfo, DfContentInfoUtils } from "./df-content-info.js";
import { DfContentAvailabilityInfo } from "./df-content-status.js";
import { MediaInfo } from "./media-info.js";

export const DfContentEntry = z.object({
  name: z.string(),
  contentInfo: DfContentInfo,
  statusInfo: DfContentAvailabilityInfo,
  downloads: DfContentDownloadInfo.array(),
});
export type DfContentEntry = z.infer<typeof DfContentEntry>;

export type DfContentEntryCreate = Omit<DfContentEntry, "downloads">;
export type DfContentEntryUpdate = Partial<DfContentEntryCreate> & {
  name: string;
};

export const DfContentEntryUtils = {
  create: (name: string, contentInfo: DfContentInfo, statusInfo: DfContentAvailabilityInfo): DfContentEntry => ({
    name,
    contentInfo,
    statusInfo,
    downloads: [],
  }),
  hasDownload: (entry: DfContentEntry): boolean => {
    return entry.downloads.length > 0;
  },
  getDownloadForFormat: (entry: DfContentEntry, format: string): DfContentDownloadInfo | undefined => {
    return entry.downloads.find((d) => d.mediaInfo.format === format);
  },
  getTotalDuration: (dfContentEntries: DfContentEntry[]): number => {
    return DfContentInfoUtils.getTotalDuration(dfContentEntries.map((dfContentEntry) => dfContentEntry.contentInfo));
  },
};

export const isContentEntry = (contentInfo: DfContentInfo | DfContentEntry): contentInfo is DfContentEntry => {
  return Boolean((contentInfo as DfContentEntry).contentInfo);
};
