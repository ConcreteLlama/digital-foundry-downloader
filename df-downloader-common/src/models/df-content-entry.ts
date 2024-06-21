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
  addDownload: (entry: DfContentEntry, download: DfContentDownloadInfo): DfContentEntry => {
    const downloads = entry.downloads ?? [];
    const existingFileIndex = downloads.findIndex((d) => d.downloadLocation === download.downloadLocation);
    if (existingFileIndex === -1) {
      downloads.push(download);
    } else {
      downloads[existingFileIndex] = download;
    }
    entry.downloads = downloads;
    return entry;
  },
  addSubs: (entry: DfContentEntry, downloadLocation: string, subs: DfContentSubtitleInfo): DfContentEntry => {
    const download = entry.downloads.find((d) => d.downloadLocation === downloadLocation);
    if (!download) {
      throw new Error(`Download ${downloadLocation} not found for content ${entry.name}`);
    }
    download.subtitles = download.subtitles ?? [];
    download.subtitles.push(subs);
    return entry;
  },
  setSubs: (entry: DfContentEntry, downloadLocation: string, subs: DfContentSubtitleInfo[]): DfContentEntry => {
    const download = entry.downloads.find((d) => d.downloadLocation === downloadLocation);
    if (!download) {
      throw new Error(`Download ${downloadLocation} not found for content ${entry.name}`);
    }
    download.subtitles = subs;
    return entry;
  },
  removeDownload: (entry: DfContentEntry, downloadLocation: string): DfContentEntry => {
    entry.downloads = entry.downloads.filter((d) => d.downloadLocation !== downloadLocation);
    return entry;
  },
  clearDownloads: (entry: DfContentEntry): DfContentEntry => {
    entry.downloads = [];
    return entry;
  },
  hasDownload: (entry: DfContentEntry): boolean => {
    return entry.downloads.length > 0;
  },
  getDownload: (entry: DfContentEntry, downloadLocation: string): DfContentDownloadInfo | undefined => {
    return entry.downloads.find((d) => d.downloadLocation === downloadLocation);
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
