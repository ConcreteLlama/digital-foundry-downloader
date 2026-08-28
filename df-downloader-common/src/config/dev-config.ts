import { z } from "zod";

export const DevConfig = z
  .object({
    // Set by the transform below rather than by hand, so it carries no
    // user-facing description of its own.
    devConfigEnabled: z.boolean().optional(),
    devModeEnabled: z
      .boolean()
      .optional()
      .describe(
        "Turns on developer-only pages and tooling. Nothing here is needed for normal use, and with it off none of the other dev settings apply."
      ),
    downloadUrlOverride: z
      .string()
      .optional()
      .describe("Download this URL instead of the real one, so the download pipeline can be exercised without pulling a real video."),
    disableBranchWarning: z
      .boolean()
      .optional()
      .describe("Stops the warning shown when running a build from a branch other than main."),
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
