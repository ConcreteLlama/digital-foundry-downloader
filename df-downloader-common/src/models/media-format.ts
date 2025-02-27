import { z } from "zod";

export const MediaFormat = z.enum(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264", "MP3", "Video (Unknown)", "Audio (Unknown)", "Unknown"]);
export type MediaFormat = z.infer<typeof MediaFormat>;

export const AllMediaFormats: string[] = MediaFormat.options;

export const audioFormats = new Set<MediaFormat>(["MP3"]);
export const videoFormats = new Set<MediaFormat>(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264"]);