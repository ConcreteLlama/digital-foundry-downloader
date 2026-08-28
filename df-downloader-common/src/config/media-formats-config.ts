import { z } from "zod";
import { MediaFormat } from "../models/media-info/media-format.js";

export const MediaFormatsConfig = z.object({
  /** The media formats that are accetable for automatic downloads or media info-less download triggers in priority order */
  priorities: z
    .array(MediaFormat)
    .default(["4K", "1440p", "1080p", "720p", "Video"])
    .describe(
      "The formats you are willing to accept, best first. A download takes the highest one the video is actually available in, and anything left off the list is never downloaded."
    ),
});
export type MediaFormatsConfig = z.infer<typeof MediaFormatsConfig>;
export const MediaFormatsConfigKey = "mediaFormats";
