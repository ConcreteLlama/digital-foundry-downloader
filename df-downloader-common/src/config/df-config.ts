import { z } from "zod";

export const DfConfig = z.object({
  /**
   * Digital Foundry's `autologin` cookie (persistent remember-me token).
   * Field is still named `sessionId` for config/DB backward compatibility -
   * it held the old site's `sessionid` cookie pre-relaunch. See
   * docs/DF_SITE_MIGRATION.md.
   */
  sessionId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "The 'autologin' cookie from your browser after signing in to digitalfoundry.net. This is what lets the app see and download the members-only videos your account has access to."
    ),
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
  requestSpacingMinMs: z
    .number()
    .min(5000)
    .default(5000)
    .describe(
      "The shortest gap left between requests to digitalfoundry.net. Each request waits a random amount between this and the maximum, so a scan does not arrive as a steady drumbeat. Being too eager here has already earned this tool an IP ban once, so there is deliberately no faster option."
    ),
  requestSpacingMaxMs: z
    .number()
    .min(5000)
    .default(15000)
    .describe(
      "The longest gap left between requests to digitalfoundry.net. Raising it is gentler on their servers; lowering it makes a full scan finish sooner."
    ),
});
export type DfConfig = z.infer<typeof DfConfig>;
export const DfConfigKey = "digitalFoundry";
