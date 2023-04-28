import { z } from "zod";

export const MetadataConfig = z.object({
  injectMetadata: z.boolean().default(true),
});
export const MetadataConfigKey = "metadata";
