import { z } from "zod";
import { zUndefinedInfinity } from "./utils.js";

export const ContentDetectionConfig = z.object({
  contentCheckInterval: z.number().min(30000).default(60000),
  maxArchivePage: zUndefinedInfinity(z.number().min(1)),
});
export type ContentDetectionConfig = z.infer<typeof ContentDetectionConfig>;
export const ContentDetectionConfigKey = "contentDetection";
