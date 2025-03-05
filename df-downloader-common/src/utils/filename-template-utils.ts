import { format } from "date-fns";
import Handlebars from 'handlebars';
import { DfContentInfo } from "../models/df-content-info.js";
import { MediaInfo, MediaInfoUtils } from "../models/media-info/media-info.js";
import { commonReplacements, sanitizeFilePath, testFilePath } from "./file-utils.js";
import { errorToString } from "./error.js";

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
    const tags = this.tags?.map((tag: string) => tag.toLowerCase()) || [];
    if (tags.includes(tag.toLowerCase())) {
        return options.fn(this);
    }
    return options.inverse(this);
});


type DfTemplateVarDefinition = {
    description: string;
    valueExtractor: (contentInfo: DfContentInfo, mediaInfo: MediaInfo) => any;
}

export enum DfFilenameTemplateVar {
    CONTENT_URL_NAME = "content-url-name",
    TITLE = "title",
    DOWNLOAD_FILENAME = "download-filename",
    FORMAT = "format",
    AUDIO_ENCODING = "audio-encoding",
    VIDEO_ENCODING = "video-encoding",
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
        description: "The tags of the content. This is an array and will produce a comma separated list.",
        valueExtractor: (contentInfo) => contentInfo.tags,
    },
    "audio-encoding": {
        description: "The audio encoding of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.audioProperties || "unknown",
    },
    "video-encoding": {
        description: "The video encoding of the media",
        valueExtractor: (_, mediaInfo) => mediaInfo.videoProperties || "unknown",
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

export const helperVars: Record<string, string> = {
    "ifIn": "Check if a value is in a list. For example {{#ifIn tags 'retro'}}Retro/{{/ifIn}} will put any content with the tag 'retro' in a 'Retro' directory.",
    "ifTag": `Check if a tag is in the content's tags. For example "{{#ifTag 'retro'}}Retro/{{/ifTag}} will put any content with the tag 'retro' in a 'Retro' directory.`,
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