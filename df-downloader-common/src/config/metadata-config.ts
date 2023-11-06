import { z } from "zod";

export const MetadataConfig = z.object({
  /** Whether to inject metadata into the downloaded files */
  injectMetadata: z.boolean().default(true),
});
export const MetadataConfigKey = "metadata";

export const DefaultMetadataConfig = {
  injectMetadata: true,
};
