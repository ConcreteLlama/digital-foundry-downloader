import { z } from "zod";
import { bytesToHumanReadable } from "../../utils/file-utils.js";

export const Resolution = z.object({
    width: z.number(),
    height: z.number(),
});
export type Resolution = z.infer<typeof Resolution>;

export const VideoProperties = z.object({
    resolution: Resolution.nullable(),
    framerate: z.number().nullable(),
    bitrate: z.number().nullable(),
});
export type VideoProperties = z.infer<typeof VideoProperties>;

export const getResolution = (videoProperties: string) => {
    const resolutionMatch = videoProperties.match(/(\d+)x(\d+)/);
    if (resolutionMatch) {
        const [_, width, height] = resolutionMatch;
        return { width: parseInt(width), height: parseInt(height) };
    }
    return null;
};

const stringToFrameRate = (framerate: string) => {
    const frameRateNum = parseFloat(framerate);
    if (isNaN(frameRateNum)) {
        return null;
    }
    return frameRateNum;
}

export const getFramerate = (videoProperties: string) => {
    const framerateMatch = videoProperties.match(/([\d.]+)fps/);
    if (framerateMatch) {
        return stringToFrameRate(framerateMatch[1]);
    }
    return null;
};

const stringToBitrate = (bitrate: string) => {
    const bitrateNum = parseFloat(bitrate);
    if (isNaN(bitrateNum)) {
        return null;
    }
    return bitrateNum * 1000000;
}

export const getBitrate = (videoProperties: string) => {
    const bitrateMatch = videoProperties.match(/([\d.]+)mbps/);
    if (bitrateMatch) {
        return stringToBitrate(bitrateMatch[1]);
    }
    return null;
};

export const getVideoProperties = (videoProperties?: string | null): VideoProperties | null => {
    if (!videoProperties) {
        return null;
    }
    const videoPropertiesSanitized = videoProperties.toLowerCase().trim();
    if (videoPropertiesSanitized === "-" || videoPropertiesSanitized === "none") {
        return null;
    }
    const matches = videoPropertiesSanitized.match(/(\d+)x(\d+),\s*([\d.]+)fps,\s*([\d.]+)mbps/);
    if (matches) {
        const [_, width, height, framerate, bitrate] = matches;
        return {
            resolution: { width: parseInt(width), height: parseInt(height) },
            framerate: stringToFrameRate(framerate),
            bitrate: stringToBitrate(bitrate),
        };
    } else {
        const resolution = getResolution(videoPropertiesSanitized);
        const framerate = getFramerate(videoPropertiesSanitized);
        const bitrate = getBitrate(videoPropertiesSanitized);
        return {
            resolution,
            framerate,
            bitrate,
        }
    }
}

export type ResolutionAbbrev = "8K" | "4K" | "1440p" | "1080p" | "720p";
const ResolutionVerticals: Record<ResolutionAbbrev, number> = {
    "8K": 4320,
    "4K": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
};

const resoultionMatches = (resolution: Resolution, res: Resolution | ResolutionAbbrev, mode?: 'exact' | 'atLeast') => {
    const vertical = typeof res === 'string' ? ResolutionVerticals[res] : res.height;
    if (mode === 'exact') {
        return resolution.height === vertical;
    } else {
        return resolution.height >= vertical;
    }
}

export type FramerateAbbrev = "24fps" | "30fps" | "60fps" | "120fps";
const FramerateNumericalsValues: Record<FramerateAbbrev, {
    min: number,
    max: number,
}> = {
    "120fps": {
        min: 119.88,
        max: 120,
    },
    "60fps": {
        min: 59.94,
        max: 60,
    },
    "30fps": {
        min: 29.97,
        max: 30,
    },
    "24fps": {
        min: 23.97,
        max: 24,
    },
};
const framerateMatches = (framerate: number, framerateAbbred: FramerateAbbrev, mode?: 'exact' | 'atLeast') => {
    const { min, max } = FramerateNumericalsValues[framerateAbbred];
    if (mode === 'exact') {
        return framerate >= min && framerate <= max;
    } else {
        return framerate >= min;
    }
}

export const getFrameRateAbbrev = (framerate: number): FramerateAbbrev | null => {
    for (const [abbrev, { min, max }] of Object.entries(FramerateNumericalsValues)) {
        if (framerate >= min && framerate <= max) {
            return abbrev as FramerateAbbrev;
        }
    }
    return null;
}

export const makeVideoProps = (res: ResolutionAbbrev, framerate: FramerateAbbrev, bitrate: number = 15800000): VideoProperties => ({
    resolution: { width: ResolutionVerticals[res] * 16 / 9, height: ResolutionVerticals[res] },
    framerate: FramerateNumericalsValues[framerate].min,
    bitrate: bitrate,
})


export type VideoPropertiesMatcher = {
    resolution?: Resolution | ResolutionAbbrev;
    framerate?: FramerateAbbrev;
    bitrate?: number;
}

export const videoPropertiesMatch = (videoProperties: VideoProperties, matcher: VideoPropertiesMatcher, mode: 'exact' | 'atLeast' = 'exact') => {
    if (matcher.resolution) {
        if (!videoProperties.resolution) {
            return false;
        }
        if (!resoultionMatches(videoProperties.resolution, matcher.resolution, mode)) {
            return false;
        }
    }
    if (matcher.framerate) {
        if (!videoProperties.framerate) {
            return false;
        }
        if (!framerateMatches(videoProperties.framerate, matcher.framerate, mode)) {
            return false;
        }
    }
    if (matcher.bitrate) {
        if (!videoProperties.bitrate) {
            return false;
        }
        if (mode === 'exact') {
            return videoProperties.bitrate === matcher.bitrate;
        } else {
            return videoProperties.bitrate >= matcher.bitrate;
        }
    }
    return true;
}

export const describeVideoPropertiesMatcher = (matcher: VideoPropertiesMatcher) => {
    const parts: string[] = [];
    if (matcher.resolution) {
        parts.push(`Resolution: ${typeof matcher.resolution === 'string' ? matcher.resolution : `${matcher.resolution.width}x${matcher.resolution.height}`}`);
    }
    if (matcher.framerate) {
        parts.push(`Framerate: ${matcher.framerate}`);
    }
    if (matcher.bitrate) {
        parts.push(`Bitrate: ${matcher.bitrate}`);
    }
    return parts.join(', ');
}

export const videoPropertiesToString = (videoProperties: VideoProperties | null) => {
    if (!videoProperties) {
        return "None";
    }
    const { resolution, framerate, bitrate } = videoProperties;
    const resolutionStr = resolution ? `${resolution.width}x${resolution.height}` : 'Unknown resolution';
    const framerateStr = framerate ? `${framerate}fps` : 'Unknown framerate';
    const bitrateStr = bitrate ? `${bitrate / 1000000}mbps` : 'Unknown bitrate';
    return `${resolutionStr}, ${framerateStr}, ${bitrateStr}`;
}

export const getResolutionAbbrev = (resolution: Resolution): ResolutionAbbrev | null => {
    for (const [abbrev, vertical] of Object.entries(ResolutionVerticals)) {
        if (resolution.height >= vertical) {
            return abbrev as ResolutionAbbrev;
        }
    }
    return null;
}

export const resolutionToString = (resolution: Resolution | null) => {
    if (!resolution) {
        return "Unknown resolution";
    }
    return `${resolution.width}x${resolution.height}`;
}

export const bitrateToString = (bitrate: number | null) => {
    if (!bitrate) {
        return "Unknown bitrate";
    }
    return `${bytesToHumanReadable(bitrate, {
        si: true,
        unitGap: false,
        decimalPlaces: 1,
    }).toLowerCase()}ps`;
}