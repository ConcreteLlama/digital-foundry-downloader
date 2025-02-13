import { ContentMoveFileInfo, DfContentEntry, DfContentInfo, DfContentInfoUtils, MediaInfo } from "df-downloader-common";
import { makeFilenameWithTemplate } from "df-downloader-common/utils/filename-template-utils.js";
import path from "path";
import { configService } from "../config/config.js";
import { pathIsEqual, sanitizeFilePath } from "./file-utils.js";

export const makeFilePathWithTemplate = (content: DfContentInfo, mediaInfo: MediaInfo, template: string) => {
    const rawFilename = makeFilenameWithTemplate(content, mediaInfo, template);
    const sanitizedFilename = sanitizeFilePath(rawFilename).fullPath;
    const destination = path.join(configService.config.contentManagement.destinationDir, sanitizedFilename);
    return destination;
};

export const getFileMoveList = (contentEntires: DfContentEntry[], template: string) => contentEntires.reduce((acc, { contentInfo, downloads }) => {
    if (!downloads.length) {
        return acc;
    }
    const oldFilenames = new Set<string>();
    for (const download of downloads) {
        const mediaInfo = DfContentInfoUtils.getMediaInfo(contentInfo, download.format);
        if (mediaInfo) {
            const oldFilename = path.normalize(download.downloadLocation);
            if (oldFilenames.has(oldFilename)) {
                continue;
            }
            oldFilenames.add(oldFilename);
            const newFilename = path.normalize(makeFilePathWithTemplate(contentInfo, mediaInfo, template));
            if (!pathIsEqual(oldFilename, newFilename)) {
                acc.push({
                    contentName: contentInfo.name,
                    oldFilename: oldFilename,
                    newFilename: newFilename,
                });
            }
        }
    };
    return acc;
}, [] as ContentMoveFileInfo[])
