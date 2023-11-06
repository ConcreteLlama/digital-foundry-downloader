import { z } from "zod";

export const MediaType = z.enum(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264", "MP3"]);
export type MediaType = z.infer<typeof MediaType>;

export const DfConfig = z.object({
  /** Digital Foundry sessionid cookie */
  sessionId: z.string().optional().nullable(),
});
export type DfConfig = z.infer<typeof DfConfig>;
export const DfConfigKey = "digitalFoundry";
