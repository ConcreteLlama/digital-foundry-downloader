import { DfContentInfo } from "../models/df-content-info.js";
import { MediaInfo, MediaInfoUtils } from "../models/media-info.js";
import Mustache from "mustache";
import { format } from "date-fns";

type DfTemplateVarDefinition = {
    description: string;
    valueExtractor: (contentInfo: DfContentInfo, mediaInfo: MediaInfo) => string;
}

export enum DfFilenameTemplateVar {
    CONTENT_URL_NAME = "content-url-name",
    TITLE = "title",
    DOWNLOAD_FILENAME = "download-filename",
    FORMAT = "format",
    AUDIO_ENCODING = "audio-encoding",
    VIDEO_ENCODING = "video-encoding",
    EXTENSION = "ext",
    DAY = "DD",
    MONTH = "MM",
    YEAR = "YYYY",
    YEAR_SHORT = "YY",
    HOUR = "hh",
    MINUTE = "mm",
    SECOND = "ss",
    DATE = "date",
    TIME = "time",
    DATETIME = "datetime",
};
export const DfFilenameTemplateVarNames = Object.values(DfFilenameTemplateVar);
export type DfFilenameTemplateVarName = typeof DfFilenameTemplateVarNames[number];

export const DfFilenameTemplateVarDefinitions: Record<DfFilenameTemplateVarName, DfTemplateVarDefinition> = {
    "content-url-name": {
        description: "The name of the content in the URL (e.g. df-direct-weekly-...)",
        valueExtractor: (contentInfo) => contentInfo.name,
    },
    "title": {
        description: "The title of the content taken from the page",
        valueExtractor: (contentInfo) => contentInfo.title,
    },
    "download-filename": {
        description: "The filename of the media",
        valueExtractor: (contentInfo, mediaInfo) => mediaInfo.mediaFilename || contentInfo.name,
    },
    "format": {
        description: "The format of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.mediaType,
    },
    "audio-encoding": {
        description: "The audio encoding of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.audioEncoding || "unknown",
    },
    "video-encoding": {
        description: "The video encoding of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.videoEncoding || "unknown",
    },
    "ext": {
        description: "The file extension of the media",
        valueExtractor: (_, mediaInfo) => MediaInfoUtils.getExtension(mediaInfo),
    },
    "DD": {
        description: "The day of the month (01-31)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "dd"),
    },
    "MM": {
        description: "The month of the year (01-12)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "MM"),
    },
    "YYYY": {
        description: "The year",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "yyyy"),
    },
    "YY": {
        description: "The year (last two digits)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "yy"),
    },
    "hh": {
        description: "The hour of the day (00-23)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "HH"),
    },
    "mm": {
        description: "The minute of the hour (00-59)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "mm"),
    },
    "ss": {
        description: "The second of the minute (00-59)",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "ss"),
    },
    "date": {
        description: "The date in the format YYYY-MM-DD",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "yyyy-MM-dd"),
    },
    "time": {
        description: "The time in the format HH-mm-ss",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "HH-mm-ss"),
    },
    "datetime": {
        description: "The date and time in the format YYYY-MM-DD_HH-mm-ss",
        valueExtractor: (contentInfo) => format(contentInfo.publishedDate, "yyyy-MM-dd_HH-mm-ss"),
    },
};

export const generateFilenameTemplateVarMap = (contentInfo: DfContentInfo, mediaInfo: MediaInfo) => Object.entries(DfFilenameTemplateVarDefinitions).reduce((acc, [key, { valueExtractor }]) => {
    acc[key] = () => valueExtractor(contentInfo, mediaInfo);
    return acc;
}, {} as Record<string, (() => string)>);

export const makeFilenamePath = (contentInfo: DfContentInfo, mediaInfo: MediaInfo, template: string) => {
    const toReturn = Mustache.render(template, generateFilenameTemplateVarMap(contentInfo, mediaInfo));
    const extension = MediaInfoUtils.getExtension(mediaInfo);
    if (!toReturn.endsWith(extension)) {
        return `${toReturn}.${extension}`;
    }
    return toReturn;
};