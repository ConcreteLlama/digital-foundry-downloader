import { z } from "zod";
import { MediaFormat } from "../models/media-format.js";

export const MediaFormatsConfig = z.object({
  /** The media formats that are accetable for automatic downloads or media info-less download triggers in priority order */
  priorities: z.array(MediaFormat).default(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264", "MP3", "Video (Unknown)", "Audio (Unknown)"]),
});
export type MediaFormatsConfig = z.infer<typeof MediaFormatsConfig>;
export const MediaFormatsConfigKey = "mediaFormats";
