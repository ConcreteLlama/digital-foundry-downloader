import { z } from "zod";
import { MediaFormat } from "../models/media-info/media-format.js";

export const MediaFormatsConfig = z.object({
  /** The media formats that are accetable for automatic downloads or media info-less download triggers in priority order */
  priorities: z.array(MediaFormat).default(["4K", "1440p", "1080p", "720p", "Video"]),
});
export type MediaFormatsConfig = z.infer<typeof MediaFormatsConfig>;
export const MediaFormatsConfigKey = "mediaFormats";
