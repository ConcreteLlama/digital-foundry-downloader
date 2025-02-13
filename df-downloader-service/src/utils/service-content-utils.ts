import { DfContentDownloadInfo, DfContentEntry, DfContentSubtitleInfo } from "df-downloader-common";
import { pathIsEqual } from "../utils/file-utils.js";

export const ServiceContentUtils = {
    addDownload: (entry: DfContentEntry, download: DfContentDownloadInfo): DfContentEntry => {
        const downloads = entry.downloads ?? [];
        const existingFileIndex = ServiceContentUtils.getDownloadIndexByLocation(entry, download.downloadLocation);
        if (existingFileIndex === -1) {
            downloads.push(download);
        } else {
            downloads[existingFileIndex] = download;
        }
        entry.downloads = downloads;
        return entry;
    },
    getDownloadByLocation: (entry: DfContentEntry, downloadLocation: string): DfContentDownloadInfo | undefined => {
        return entry.downloads.find((d) => pathIsEqual(d.downloadLocation, downloadLocation));
    },
    getDownloadIndexByLocation: (entry: DfContentEntry, downloadLocation: string): number => {
        return entry.downloads.findIndex((d) => pathIsEqual(d.downloadLocation, downloadLocation));
    },
    removeDownload: (entry: DfContentEntry, downloadLocation: string): DfContentEntry => {
        entry.downloads = entry.downloads.filter((d) => !pathIsEqual(d.downloadLocation, downloadLocation));
        return entry;
    },
    addSubs: (entry: DfContentEntry, downloadLocation: string, subs: DfContentSubtitleInfo): DfContentEntry => {
        const download = ServiceContentUtils.getDownloadByLocation(entry, downloadLocation);
        if (!download) {
            throw new Error(`Download ${downloadLocation} not found for content ${entry.name}`);
        }
        download.subtitles = download.subtitles ?? [];
        download.subtitles.push(subs);
        return entry;
    },
    setSubs: (entry: DfContentEntry, downloadLocation: string, subs: DfContentSubtitleInfo[]): DfContentEntry => {
        const download = ServiceContentUtils.getDownloadByLocation(entry, downloadLocation);
        if (!download) {
            throw new Error(`Download ${downloadLocation} not found for content ${entry.name}`);
        }
        download.subtitles = subs;
        return entry;
    },
    moveDownload: (entry: DfContentEntry, oldDownloadLocation: string, newDownloadLocation: string): DfContentEntry => {
        const download = ServiceContentUtils.getDownloadByLocation(entry, oldDownloadLocation);
        if (!download) {
            throw new Error(`Download ${oldDownloadLocation} not found for content ${entry.name}`);
        }
        download.downloadLocation = newDownloadLocation;
        return entry;
    },
    clearDownloads: (entry: DfContentEntry): DfContentEntry => {
        entry.downloads = [];
        return entry;
    },
}