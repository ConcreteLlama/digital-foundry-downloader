// Example: AC3 2.0, 448kbps, 48000Hz
// Regex: /([A-Z0-9]+) ([0-9.]+), ([0-9]+)kbps, ([0-9]+)Hz/

import { z } from "zod";

export const AudioProperties = z.object({
    rawString: z.string(),
    encoding: z.string().nullable(),
    channels: z.string().nullable(),
    bitrate: z.number().nullable(),
    sampleRate: z.number().nullable(),
});
export type AudioProperties = z.infer<typeof AudioProperties>;

export const getAudioProperties = (audioProperties?: string | null): AudioProperties | null => {
    if (!audioProperties) {
        return null;
    }
    const trimmedAndLower = audioProperties?.trim().toLowerCase();
    if (!trimmedAndLower || trimmedAndLower === "-" || trimmedAndLower === "none") {
        return null;
    }
    const [_result, encoding, channels, bitrate, sampleRate] = /([A-Z0-9]+) ([0-9.]+), ([0-9]+)kbp?s, ([0-9]+)Hz/.exec(audioProperties) || [];
    return {
        rawString: audioProperties,
        encoding: encoding || null,
        channels: channels || null,
        bitrate: bitrate ? parseInt(bitrate) * 1000 : null,
        sampleRate: sampleRate ? parseInt(sampleRate) : null,
    };
}

export const audioPropertiesToString = (audioProperties: AudioProperties | null) => {
    if (!audioProperties) {
        return "None";
    }
    const {encoding, channels, bitrate, sampleRate} = audioProperties;
    const encodingStr = encoding || 'Unknown';
    const channelsStr = channels || 'Unknown channels';
    const bitrateStr = bitrate ? `${bitrate / 1000}kbps` : 'Unknown bitrate';
    const sampleRateStr = sampleRate ? `${sampleRate / 1000}Hz` : 'Unknown sample rate';
    return `${encodingStr}, ${channelsStr}, ${bitrateStr}, ${sampleRateStr}`;
}