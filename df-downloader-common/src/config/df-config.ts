import { z } from "zod";

export const DfConfig = z.object({
  /**
   * Digital Foundry's `autologin` cookie (persistent remember-me token).
   * Field is still named `sessionId` for config/DB backward compatibility -
   * it held the old site's `sessionid` cookie pre-relaunch. See
   * docs/DF_SITE_MIGRATION.md.
   */
  sessionId: z.string().optional().nullable(),
  /**
   * Minimum spacing between consecutive requests to digitalfoundry.net
   * itself (listing/auth-check requests - not downloads, which land on a
   * signed CDN URL instead), in milliseconds. A random value is picked
   * between these two bounds for each request (see df-request-queue.ts),
   * so a scan doesn't look like a metronome. Hard-floored at 5 seconds -
   * this exists specifically because a prior IP ban from Digital Foundry's
   * Cloudflare protection during testing (see docs/DF_SITE_MIGRATION.md)
   * showed how easily a well-meaning client can look abusive; no "faster"
   * option is offered on purpose.
   */
  requestSpacingMinMs: z.number().min(5000).default(5000),
  requestSpacingMaxMs: z.number().min(5000).default(15000),
});
export type DfConfig = z.infer<typeof DfConfig>;
export const DfConfigKey = "digitalFoundry";
