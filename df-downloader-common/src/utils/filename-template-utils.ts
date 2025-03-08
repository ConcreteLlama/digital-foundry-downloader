import { format } from "date-fns";
import Handlebars from 'handlebars';
import { DfContentInfo } from "../models/df-content-info.js";
import { MediaInfo, MediaInfoUtils } from "../models/media-info/media-info.js";
import { bytesToHumanReadable, commonReplacements, sanitizeFilePath, testFilePath } from "./file-utils.js";
import { errorToString } from "./error.js";
import { audioPropertiesToString, bitrateToString, getFrameRateAbbrev, getResolutionAbbrev, resolutionToString, videoPropertiesToString } from "../models/index.js";

Handlebars.registerHelper('ifIn', function (this: any, list, elem, options) {
    if (!Array.isArray(list)) {
        list = list(this);
    }
    if (list.indexOf(elem) > -1) {
        return options.fn(this);
    }
    return options.inverse(this);
});

Handlebars.registerHelper('ifTag', function (this: any, tag, options) {
    const tags = this.tagsArray?.map((tag: string) => tag.toLowerCase()) || [];
    if (tags.includes(tag.toLowerCase())) {
        return options.fn(this);
    }
    return options.inverse(this);
});

type DfTemplateVarDefinition = {
    description: string;
    valueExtractor: (contentInfo: DfContentInfo, mediaInfo: MediaInfo) => any;
    hidden?: boolean;
}

export enum DfFilenameTemplateVar {
    CONTENT_URL_NAME = "content-url-name",
    TITLE = "title",
    DOWNLOAD_FILENAME = "download-filename",
    FORMAT = "format",
    AUDIO_PROPERTIES = "audio-properties",
    AUDIO_ENCODING = "audio-encoding",
    AUDIO_CHANNELS = "audio-channels",
    AUDIO_BITRATE = "audio-bitrate",
    AUDIO_SAMPLE_RATE = "audio-sample-rate",
    VIDEO_PROPERTIES = "video-properties",
    VIDEO_ENCODING = "video-encoding",
    VIDEO_BITRATE = "video-bitrate",
    VIDEO_RESOLUTION = "video-resolution",
    VIDEO_RESOLUTION_LABEL = "video-resolution-label",
    VIDEO_FRAMERATE = "video-framerate",
    VIDEO_FRAMERATE_LABEL = "video-framerate-label",
    RAW_TAGS = "tagsArray",
    TAGS = "tags",
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

export const requireAtLeastOneOf: DfFilenameTemplateVar[] = [
    DfFilenameTemplateVar.CONTENT_URL_NAME,
    DfFilenameTemplateVar.TITLE,
    DfFilenameTemplateVar.DOWNLOAD_FILENAME,
]

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
        valueExtractor: (_, mediaInfo) => mediaInfo.formatString,
    },
    "tags": {
        description: "A dash-separated list of tags",
        valueExtractor: (contentInfo) => (contentInfo.tags || []).join('-'),
    },
    "tagsArray": {
        description: "The tags of the content as an array",
        valueExtractor: (contentInfo) => contentInfo.tags,
        hidden: true,
    },
    "audio-properties": {
        description: "The audio properties of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.audioProperties ? audioPropertiesToString(mediaInfo.audioProperties) : "unknown"
    },
    "audio-channels": {
        description: "The number of audio channels",
        valueExtractor: (_, mediaInfo) => mediaInfo.audioProperties?.channels || "unknown"
    },
    "audio-encoding": {
        description: "The audio codec",
        valueExtractor: (_, mediaInfo) => mediaInfo.audioProperties?.encoding || "unknown"
    },
    "audio-bitrate": {
        description: "The audio bitrate",
        valueExtractor: (_, {audioProperties}) => audioProperties?.bitrate ? bitrateToString(audioProperties.bitrate) : "unknown"
    },
    "audio-sample-rate": {
        description: "The audio sample rate",
        valueExtractor: (_, {audioProperties}) => audioProperties?.sampleRate ? `${audioProperties.sampleRate}hz` : "unknown"
    },
    "video-properties": {
        description: "The video properties of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.videoProperties ? videoPropertiesToString(mediaInfo.videoProperties) : "unknown"
    },
    "video-encoding": {
        description: "The video codec",
        valueExtractor: (_, mediaInfo) => mediaInfo.type === "VIDEO" ? mediaInfo.encoding : "unknown"
    },
    "video-bitrate": {
        description: "The video bitrate",
        valueExtractor: (_, {videoProperties}) => videoProperties?.bitrate ? bitrateToString(videoProperties.bitrate) : "unknown"
    },
    "video-resolution": {
        description: "The video resolution",
        valueExtractor: (_, {videoProperties}) => videoProperties?.resolution ? resolutionToString(videoProperties.resolution) : "unknown"
    },
    "video-resolution-label": {
        description: "The video resolution label (e.g. 4K, 1080p)",
        valueExtractor: (_, {videoProperties}) => videoProperties?.resolution ? getResolutionAbbrev(videoProperties.resolution) : "unknown"
    },
    "video-framerate": {
        description: "The video framerate",
        valueExtractor: (_, {videoProperties}) => videoProperties?.framerate || "unknown"
    },
    "video-framerate-label": {
        description: "The video framerate label (e.g. 60fps)",
        valueExtractor: (_, {videoProperties}) => videoProperties?.framerate ? getFrameRateAbbrev(videoProperties.framerate) : "unknown"
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

type HelperVarDefinition = {
    description: string;
    hidden?: boolean;
}
export const helperVars: Record<string, HelperVarDefinition> = {
    "ifIn": {
        description: "Check if a value is in a list. For example {{#ifIn tags 'retro'}}Retro/{{/ifIn}} will put any content with the tag 'retro' in a 'Retro' directory.",
        hidden: true,
    },
    "ifTag": {
        description: `Check if a tag is in the content's tags. For example "{{#ifTag 'retro'}}Retro/{{/ifTag}} will put any content with the tag 'retro' in a 'Retro' directory.`,
    }
};

const generateFilenameTemplateVarMap = (contentInfo: DfContentInfo, mediaInfo: MediaInfo) => Object.entries(DfFilenameTemplateVarDefinitions).reduce((acc, [key, { valueExtractor }]) => {
    acc[key] = valueExtractor(contentInfo, mediaInfo);
    return acc;
}, {} as Record<string, (() => (string | string[]))>);

export const makeFilenameWithTemplate = (contentInfo: DfContentInfo, mediaInfo: MediaInfo, templateStr: string) => {
    const template = Handlebars.compile(templateStr, {
        noEscape: true
    });
    let toReturn = template(generateFilenameTemplateVarMap(contentInfo, mediaInfo));
    const extension = MediaInfoUtils.getExtension(mediaInfo);
    if (!toReturn.endsWith(extension)) {
        toReturn += `.${extension}`;
    }
    toReturn = sanitizeFilePath(toReturn, {
        additionalReplacemenets: commonReplacements
    });
    return toReturn;
};

export class TestTemplateError extends Error {
    constructor(message: string, readonly reason: 'unknown-var' | 'invalid-template', err?: any) {
        super(message);
    }
} 

export const testTemplate = (template: string, contentInfo: DfContentInfo, mediaInfo?: MediaInfo): string => {
    let parsed: ReturnType<typeof Handlebars.parse>;
    try {
        parsed = Handlebars.parse(template);
    } catch (e: any) {
        throw new TestTemplateError(`Invalid template: ${errorToString(e)}`, 'invalid-template', e);
    }
    let hasRequiredVar = false;
    for (const statement of parsed.body as any) {
        if (statement.type !== 'MustacheStatement') {
            continue;
        }
        if (statement.path) {
            const varName = statement.path.original;
            if (!DfFilenameTemplateVarNames.includes(varName as DfFilenameTemplateVarName)) {
                throw new TestTemplateError(`Unknown template variable: ${varName}`, 'unknown-var');
            }
            if (requireAtLeastOneOf.includes(varName as DfFilenameTemplateVar)) {
                hasRequiredVar = true;
            }
        }
    }
    if (!hasRequiredVar) {
        throw new TestTemplateError(`Template must contain at least one of: ${requireAtLeastOneOf.join(', ')}`, 'invalid-template');
    }
    // Now use the dummy DF content info to test the template
    const filenamePath = makeFilenameWithTemplate(
        contentInfo,
        mediaInfo || contentInfo.mediaInfo[0],
        template
    );
    testFilePath(filenamePath);
    return filenamePath;
}