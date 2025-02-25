import { DfContentEntry, DfContentInfo, fileSizeStringToBytes, filterAndMap, MediaInfo, splitPromiseSettledResult } from "df-downloader-common";
import { FilePathInfo, listAllFiles } from "./file-utils.js";
import { fileScannerQueue } from "./queue-utils.js";
import fs from "fs/promises";
import { Stats } from "fs";

/**
 * Get the normalized string match info (lowercase, alphanumeric only) and the constituent parts
 * @param value 
 * @returns 
 */
const getStringMatchInfo = (value: string) => {
    const splat = value.toLowerCase().split(/[^a-z0-9]+/);
    return {
        normalized: splat.join(''),
        parts: splat,
    }
}

/**
 * Get the normalized file match info (lowercase, alphanumeric only), the constituent parts, and the extension
 * @param value 
 * @returns 
 */
const getFileMatchInfo = (value: string) => {
    const extension = value.split(".").pop() || '';
    const noExt = extension ? value.slice(0, -extension.length - 1) : value;
    return {
        ...getStringMatchInfo(noExt),
        extension,
    }
}

type FileMatchInfo = {
    filePathInfo: FilePathInfo;
    normalizedFilename: string;
    filenameParts: string[];
    extension: string | null;
    possibleMatches: ContentMatchResult[];
}
type ContentMatchResult = {
    contentEntry: DfContentEntry;
    mediaMatched: boolean;
    mediaInfo: MediaInfo;
    matchOn: 'name' | 'title' | 'media-filename';
}
type ContentMatchResultWithSizeDiff = ContentMatchResult & {
    sizeDiff: number;
    percentageDiff: number;
}
export type FileMatchResult = {
    /** The file path info */
    filePathInfo: FilePathInfo;
    /** A list of all possible matches */
    possibleMatches: ContentMatchResultWithSizeDiff[];
    /** The closest match - determined by whether the media info matches, and the size difference */
    closestMatch: ContentMatchResultWithSizeDiff;
    /** The file stats */
    fileStats: Stats;
}
/** Scans the specified directory for all files, then attempts to match the content entries to the files 
 * @param directory The directory to scan
 * @param maxScanDepth The maximum depth to scan
 * @param contentEntries The content entries to match against
 * */
export const findExistingContent = async (directory: string, maxScanDepth: number, contentEntries: DfContentEntry[]) => {
    const allFiles = await listAllFiles(directory, { recursive: true, maxDepth: maxScanDepth });
    const allFileMatches: FileMatchInfo[] = allFiles.map((filePathInfo) => {
        const filenameMatchInfo = getFileMatchInfo(filePathInfo.filename);
        return {
            filePathInfo,
            normalizedFilename: filenameMatchInfo.normalized,
            filenameParts: filenameMatchInfo.parts,
            extension: filenameMatchInfo.extension,
            possibleMatches: [],
        };
    });
    // We go through every file. It's possible some content has multiple matches against a file
    for (const contentInfo of contentEntries) {
        findFileMatches(allFileMatches, contentInfo);
    }
    // Now lets get the sizes for all the possible matches then get the best match for each file
    const filesWithMatches = allFileMatches.filter((fileMatchInfo) => fileMatchInfo.possibleMatches.length > 0);
    const results: PromiseSettledResult<FileMatchResult>[] = await Promise.allSettled(filesWithMatches.map(async (fileMatchInfo) => {
        const fullPath = fileMatchInfo.filePathInfo.fullPath;
        await fileScannerQueue.addWork(() => fs.access(fullPath));
        const stats = await fileScannerQueue.addWork(() => fs.stat(fullPath));
        const matchesWithDiffs = fileMatchInfo.possibleMatches.map((match) => makeMatchResultWithSizeDiff(match, stats));
        return {
            filePathInfo: fileMatchInfo.filePathInfo,
            possibleMatches: matchesWithDiffs,
            fileStats: stats,
            closestMatch: getClosestMatch(matchesWithDiffs),
        };
    }));
    const { fulfilled, rejected } = splitPromiseSettledResult(results);
    return {
        matches: fulfilled,
        rejected,
    }
}

const findFileMatches = (fileMatcherInfos: FileMatchInfo[], contentEntry: DfContentEntry) => {
    const { contentInfo } = contentEntry;
    const contentNameMatch = getStringMatchInfo(contentInfo.name);
    const contentTitleMatch = getStringMatchInfo(contentInfo.title);
    for (const fileMatcherInfo of fileMatcherInfos) {
        const { normalizedFilename, filePathInfo: { filename } } = fileMatcherInfo;
        const titleMatched = fileMatcherInfo.normalizedFilename.includes(contentTitleMatch.normalized);
        const nameMatched = fileMatcherInfo.normalizedFilename.includes(contentNameMatch.normalized);
        let foundMediaMatch = false;
        for (const mediaInfo of contentInfo.mediaInfo) {
            if (mediaInfo.mediaFilename) {
                const mediaFilename = getFileMatchInfo(mediaInfo.mediaFilename);
                if (normalizedFilename.includes(mediaFilename.normalized)) {
                    fileMatcherInfo.possibleMatches.push({
                        contentEntry,
                        matchOn: 'media-filename',
                        mediaMatched: true,
                        mediaInfo,
                    });
                    foundMediaMatch = true;
                    continue;
                }
            }
            if (nameMatched || titleMatched) {
                const normalizedFormat = getStringMatchInfo(mediaInfo.format);
                if (fileMatcherInfo.normalizedFilename.includes(normalizedFormat.normalized)) {
                    fileMatcherInfo.possibleMatches.push({
                        contentEntry,
                        matchOn: nameMatched ? 'name' : 'title',
                        mediaMatched: true,
                        mediaInfo,
                    });
                    foundMediaMatch = true;
                }
            }
        }
        if (!foundMediaMatch && (nameMatched || titleMatched)) {
            for (const mediaInfo of contentInfo.mediaInfo) {
                fileMatcherInfo.possibleMatches.push({
                    contentEntry,
                    matchOn: nameMatched ? 'name' : 'title',
                    mediaMatched: false,
                    mediaInfo,
                });
            }

        }
    }
}

const makeMatchResultWithSizeDiff = (matchResult: ContentMatchResult, stats: Stats): ContentMatchResultWithSizeDiff => {
    const mediaInfoSize = fileSizeStringToBytes(matchResult.mediaInfo.size || "0");
    return {
        ...matchResult,
        sizeDiff: Math.abs(mediaInfoSize - stats.size),
        percentageDiff: Math.abs((mediaInfoSize - stats.size) / mediaInfoSize) * 100,
    }
}

const getClosestMatch = (possibleMatches: ContentMatchResultWithSizeDiff[]) => {
    if (possibleMatches.length === 1) {
        return possibleMatches[0];
    }
    const mediaMatches = possibleMatches.filter((match) => match.mediaMatched);
    if (mediaMatches.length === 1) {
        return mediaMatches[0];
    }
    const toCompare = mediaMatches.length > 1 ? mediaMatches : possibleMatches;
    return toCompare.sort((a, b) => a.sizeDiff - b.sizeDiff)[0];
}