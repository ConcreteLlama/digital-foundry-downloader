import { z } from "zod";

export const DfConfig = z.object({
  /** Digital Foundry sessionid cookie */
  sessionId: z.string().optional().nullable(),
});
export type DfConfig = z.infer<typeof DfConfig>;
export const DfConfigKey = "digitalFoundry";
