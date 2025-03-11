import { z } from "zod";

export const DevConfig = z
  .object({
    devConfigEnabled: z.boolean().optional(),
    devModeEnabled: z.boolean().optional(),
    downloadUrlOverride: z.string().optional(),
    disableBranchWarning: z.boolean().optional(),
  })
  .transform((v) => {
    if (Object.keys(v).length === 0) {
      return v;
    }
    if (v.devModeEnabled !== false) {
      v.devConfigEnabled = true;
    }
    return v;
  });

export type DevConfig = z.infer<typeof DevConfig>;
export const DevConfigKey = "dev";
