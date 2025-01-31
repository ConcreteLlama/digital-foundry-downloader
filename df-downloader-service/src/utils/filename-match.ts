import { DfContentInfo, MediaInfo, MediaInfoUtils, oldSanitizeFileName, sanitizeFilename } from "df-downloader-common";
import { sanitizeFilePath } from "./file-utils.js";
import { DfFilenameTemplateVar, makeFilenameWithTemplate } from "df-downloader-common/utils/filename-template-utils.js";

type PossibleFilename = {
    filename: string;
    exactMediaMatch: boolean;
}
const makePossibleFilename = (filename: string, absoluteMediaMatch: boolean): PossibleFilename => ({
    filename,
    exactMediaMatch: absoluteMediaMatch,
});
export const makePossibleFilenames = (dfContentInfo: DfContentInfo, mediaInfo: MediaInfo, currentTemplate: string): PossibleFilename[] => {
    const extension = MediaInfoUtils.getExtension(mediaInfo);
    const toReturn = [
        makePossibleFilename(sanitizeFilename(`${dfContentInfo.name}.${extension}`), false),
        makePossibleFilename(sanitizeFilename(`${dfContentInfo.name}_${mediaInfo.mediaType}.${extension}`), true),
        makePossibleFilename(`${oldSanitizeFileName(dfContentInfo.name)}.${extension}`, false),
        makePossibleFilename(`${oldSanitizeFileName(`${dfContentInfo.name}_${mediaInfo.mediaType}`)}.${extension}`, true),
        makePossibleFilename(mediaInfo.mediaFilename || sanitizeFilename(`${dfContentInfo.title}.${extension}`), true),
        makePossibleFilename(sanitizeFilePath(makeFilenameWithTemplate(dfContentInfo, mediaInfo, currentTemplate)).filename, 
            currentTemplate.includes(DfFilenameTemplateVar.DOWNLOAD_FILENAME || currentTemplate.includes(DfFilenameTemplateVar.FORMAT))),
    ]
    return Array.from(new Set(toReturn));
};