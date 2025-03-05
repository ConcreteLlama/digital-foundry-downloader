import { z } from "zod";

export const MediaFormat = z.enum([
    "HEVC (4K)",
    "HEVC (1440p)",
    "HEVC (1080p)",
    "HEVC (720p)", 
    "HEVC",
    "h.264 (4K)", 
    "h.264 (1440p)",
    "h.264 (1080p)", 
    "h.264 (720p)", 
    "h.264",
    "MP3",
    "Video (Unknown)", 
    "4K",
    "1440p",
    "1080p",
    "720p",
    "Video", 
    "Audio (Unknown)", 
    "Audio", 
    "Unknown", 
    "Any"
]);
export type MediaFormat = z.infer<typeof MediaFormat>;

export const AllMediaFormats: string[] = MediaFormat.options;

export const audioFormats = new Set<MediaFormat>(["MP3"]);
export const videoFormats = new Set<MediaFormat>(["HEVC (4K)", "HEVC (1080p)", "HEVC (720p)", "h.264 (4K)", "h.264 (1080p)", "h.264 (720p)"]);