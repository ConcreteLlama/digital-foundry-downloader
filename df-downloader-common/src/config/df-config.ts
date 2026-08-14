import { z } from "zod";

export const DfConfig = z.object({
  /**
   * Digital Foundry's `autologin` cookie (persistent remember-me token).
   * Field is still named `sessionId` for config/DB backward compatibility -
   * it held the old site's `sessionid` cookie pre-relaunch. See
   * docs/DF_SITE_MIGRATION.md.
   */
  sessionId: z.string().optional().nullable(),
});
export type DfConfig = z.infer<typeof DfConfig>;
export const DfConfigKey = "digitalFoundry";
