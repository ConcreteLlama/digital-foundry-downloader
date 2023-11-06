import { z } from "zod";
import { MediaType } from "./df-config.js";
import { ContentInfoFilter } from "../models/filter.js";

export const AutomaticDownloadsConfig = z.object({
  /** Whether automatic downloads are enabled */
  enabled: z.boolean().default(false),
  /** The media types that are accetable for automatic downloads in order of preference */
  mediaTypes: z.array(MediaType).default(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264", "MP3"]),
  /** The maximum number of concurrent downloads */
  downloadDelay: z.number().min(0).default(0),
  /** Exclusion filters for automatic downloads - if a content entry matches any of these filters, it will not be downloaded */
  exclusionFilters: z.array(ContentInfoFilter).optional(),
});
export type AutomaticDownloadsConfig = z.infer<typeof AutomaticDownloadsConfig>;
export const AutomaticDownloadsConfigKey = "automaticDownloads";
