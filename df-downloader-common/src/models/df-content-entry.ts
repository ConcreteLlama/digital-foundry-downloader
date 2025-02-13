import { z } from "zod";
import { DfContentDownloadInfo, DfContentSubtitleInfo } from "./df-content-download-info.js";
import { DfContentInfo, DfContentInfoUtils } from "./df-content-info.js";
import { DfContentStatusInfo } from "./df-content-status.js";
import { MediaInfo } from "./media-info.js";

export const CURRENT_DATA_VERSION = "2.0.2";

export const DfContentEntry = z.object({
  name: z.string(),
  /** The data version indicates whether the metadata needs refreshing, and is not related to the
   * overall schema (that's handled by DB version) */
  dataVersion: z.string(),
  contentInfo: DfContentInfo,
  statusInfo: DfContentStatusInfo,
  downloads: DfContentDownloadInfo.array(),
});
export type DfContentEntry = z.infer<typeof DfContentEntry>;

export type DfContentEntryCreate = Omit<DfContentEntry, "downloads">;
export type DfContentEntryUpdate = Partial<DfContentEntryCreate> & {
  name: string;
};

export const DfContentEntryUtils = {
  create: (name: string, contentInfo: DfContentInfo, statusInfo: DfContentStatusInfo): DfContentEntry => ({
    name,
    dataVersion: CURRENT_DATA_VERSION,
    contentInfo,
    statusInfo,
    downloads: [],
  }),
  hasDownload: (entry: DfContentEntry): boolean => {
    return entry.downloads.length > 0;
  },
  getDownloadForFormat: (entry: DfContentEntry, format: string): DfContentDownloadInfo | undefined => {
    return entry.downloads.find((d) => d.format === format);
  },
  getMediaInfo: (entry: DfContentEntry, format: string): MediaInfo | undefined => {
    return DfContentInfoUtils.getMediaInfo(entry.contentInfo, format);
  },
  update: (entry: DfContentEntry, updates: DfContentEntryUpdate): DfContentEntry => {
    return { ...entry, ...updates, downloads: entry.downloads };
  },
  getTotalDuration: (dfContentEntries: DfContentEntry[]): number => {
    return DfContentInfoUtils.getTotalDuration(dfContentEntries.map((dfContentEntry) => dfContentEntry.contentInfo));
  },
};

export const isContentEntry = (contentInfo: DfContentInfo | DfContentEntry): contentInfo is DfContentEntry => {
  return Boolean((contentInfo as DfContentEntry).contentInfo);
};
