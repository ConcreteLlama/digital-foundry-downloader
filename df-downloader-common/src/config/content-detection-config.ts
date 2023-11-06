import { z } from "zod";
import { zUndefinedInfinity } from "./utils.js";

export const ContentDetectionConfig = z.object({
  /** How often to check for new content in milliseconds */
  contentCheckInterval: z.number().min(30000).default(60000),
  /** The maximum number of pages to check for new content */
  maxArchivePage: z.number().min(1).default(1000000),
});
export type ContentDetectionConfig = z.infer<typeof ContentDetectionConfig>;
export const ContentDetectionConfigKey = "contentDetection";
