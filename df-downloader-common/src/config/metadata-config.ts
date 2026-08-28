import { z } from "zod";

export const MetadataConfig = z.object({
  /** Whether to inject metadata into the downloaded files */
  injectMetadata: z
    .boolean()
    .default(true)
    .describe(
      "Write the title, description and tags into the downloaded file itself, so media players and libraries show them without needing this app."
    ),
});
export const MetadataConfigKey = "metadata";

export const DefaultMetadataConfig = {
  injectMetadata: true,
};
