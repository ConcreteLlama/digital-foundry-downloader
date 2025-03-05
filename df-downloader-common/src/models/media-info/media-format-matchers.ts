import { sort } from "semver";
import { arrayIsEqual, isSubsetOf } from "../../utils/general.js";
import { MediaFormatMatcher, mediaInfoMatches, MediaInfoMatchesParams } from "./matcher.js";
import { MediaFormat } from "./media-format.js";
import { MediaInfo } from "./media-info.js";
import { ResolutionAbbrev } from "./video-properties.js";

const makeVideoMatcher = (encoding: "h264" | "HEVC", resolution?: ResolutionAbbrev): MediaFormatMatcher => ({
    type: "VIDEO",
    encoding,
    videoProperties: resolution ? {
        resolution,
    } : undefined
});
const makeHevcMatcher = (resolution?: ResolutionAbbrev): MediaFormatMatcher => makeVideoMatcher("HEVC", resolution);
const makeH264Matcher = (resolution?: ResolutionAbbrev): MediaFormatMatcher => makeVideoMatcher("h264", resolution);

const makeResolutionMatcher = (resolution: ResolutionAbbrev): MediaFormatMatcher => ({
    type: "VIDEO",
    videoProperties: {
        resolution,
    }
});

export const MediaFormatMatchers: Record<MediaFormat, MediaFormatMatcher> = {
    "4K": makeResolutionMatcher("4K"),
    "1440p": makeResolutionMatcher("1440p"),
    "1080p": makeResolutionMatcher("1080p"),
    "720p": makeResolutionMatcher("720p"),
    "HEVC (4K)": makeHevcMatcher("4K"),
    "HEVC (1440p)": makeHevcMatcher("1440p"),
    "HEVC (1080p)": makeHevcMatcher("1080p"),
    "HEVC (720p)": makeHevcMatcher("720p"),
    HEVC: makeHevcMatcher(),
    "h.264 (4K)": makeH264Matcher("4K"),
    "h.264 (1440p)": makeH264Matcher("1440p"),
    "h.264 (1080p)": makeH264Matcher("1080p"),
    "h.264 (720p)": makeH264Matcher("720p"),
    "h.264": makeH264Matcher(),
    MP3: {
        type: "AUDIO",
        encoding: "MP3",
    },
    "Video (Unknown)": {
        type: "VIDEO",
        encoding: "Unknown",
    },
    "Video": {
        type: "VIDEO",
    },
    "Audio (Unknown)": {
        type: "AUDIO",
        encoding: "Unknown",
    },
    "Audio": {
        type: "AUDIO",
    },
    Unknown: {
        type: "UNKNOWN",
        encoding: "Unknown",
    },
    Any: {
    }
};

export const mediaFormatMatcherList = (Object.entries(MediaFormatMatchers) as [MediaFormat, MediaFormatMatcher][])
        .map(([format, matcher]) => (mediaInfo: MediaInfoMatchesParams) => mediaInfoMatches(mediaInfo, matcher) ? format : null);

export const getMediaFormatMatches = (mediaInfo: MediaInfoMatchesParams): MediaFormat[] => {
    const matches = mediaFormatMatcherList.reduce((acc, matcher) => {
        const format = matcher(mediaInfo);
        if (format === "Any") {
            return acc;
        }
        if (format) {
            acc.push(format);
        }
        return acc;
    }, [] as MediaFormat[]);
    return matches.length ? matches : ["Unknown"];
};

export const mediaFormatMatches = (mediaFormat: MediaFormat, mediaInfo: MediaInfoMatchesParams) => {
    return mediaInfoMatches(mediaInfo, MediaFormatMatchers[mediaFormat]);
}

const getMatchTypes = (formatMatcher: any) => {
    return Object.entries(formatMatcher).reduce((acc, [key, value]) => {
        if (typeof value === 'object') {
            acc.push(...getMatchTypes(value).map((subKey: string) => `${key}.${subKey}`));
        } else if (value) {
            acc.push(`${key}.${value}`);
        }        
        return acc;
    }, [] as string[]);
}

/**
 * Ensures any format matcher that is a subset of another format matcher comes after the last format
 * matcher in the list that it is a subset of
 * @param formatList 
 * @returns 
 */

export const sortFormatMatchers = (formatList: MediaFormat[]): MediaFormat[] => {    
    const mapped = formatList.map((format) => {
        const matcher = MediaFormatMatchers[format];
        const matchTypes = new Set(getMatchTypes(matcher));
        return { format, matchTypes };
    });
    const sortedReversed = [...mapped].reverse();
    for (const a of mapped) {
        const supersetIndex = sortedReversed.findIndex((b) => b.format !== a.format && isSubsetOf(a.matchTypes, b.matchTypes));
        if (supersetIndex === -1) {
            continue;
        }
        const aReverseIndex = sortedReversed.findIndex((b) => b.format === a.format);
        if (aReverseIndex > supersetIndex) {
            // Remove a and insert it before the superset in the reversed list
            sortedReversed.splice(aReverseIndex, 1);
            sortedReversed.splice(supersetIndex, 0, a);
        }
    };

    return sortedReversed.reverse().map(({ format }) => format);
}

/*export const sortFormatMatchers = (formatList: MediaFormat[]): MediaFormat[] => {
    const sorted = formatList.map((format) => {
        const matcher = MediaFormatMatchers[format];
        const matchTypes = new Set(getMatchTypes(matcher));
        return { format, matchTypes };
    }).sort((a, b) => {
        const { matchTypes: aMatchTypes } = a;
        const { matchTypes: bMatchTypes } = b;
        // If a and b are the same, keep them in the same order
        // If b is a subset of a, a should come first
        // If a is a subset of b, b should come first
        const aIsSubset = isSubsetOf(aMatchTypes, bMatchTypes);
        const bIsSubset = isSubsetOf(bMatchTypes, aMatchTypes);
        if (aIsSubset && bIsSubset) {
            return 0;
        }
        if (aIsSubset) {
            return 1;
        }
        if (bIsSubset) {
            return -1;
        }
        return 0;
    });

    return sorted.map(({ format }) => format);
}*/