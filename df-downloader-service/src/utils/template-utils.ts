import { DfContentInfo, MediaInfo } from "df-downloader-common";
import { makeFilenameWithTemplate } from "df-downloader-common/utils/filename-template-utils.js";
import path from "path";
import { configService } from "../config/config.js";
import { sanitizeFilePath } from "./file-utils.js";

export const makeFilePathWithTemplate = (content: DfContentInfo, mediaInfo: MediaInfo, template: string) => {
    const rawFilename = makeFilenameWithTemplate(content, mediaInfo, template);
    const sanitizedFilename = sanitizeFilePath(rawFilename).fullPath;
    const destination = path.join(configService.config.contentManagement.destinationDir, sanitizedFilename);
    return destination;
};