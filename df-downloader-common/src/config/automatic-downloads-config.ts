import { z } from "zod";
import { ContentInfoFilter } from "../models/filter.js";

export const AutomaticDownloadsConfig = z.object({
  /** Whether automatic downloads are enabled */
  enabled: z
    .boolean()
    .default(false)
    .describe("Download new videos as they're published, without you having to ask for each one."),
  /**
   * Delay after detecting new content before starting the download, in
   * milliseconds - a random value is picked between these two bounds for
   * each piece of content individually, so simultaneous checks (across many
   * self-hosted installations, not just multiple items in one check) don't
   * all start downloading from Digital Foundry's CDN at the same instant.
   * Defaults to a 5-20 minute spread so installs that never touch this
   * setting still add some jitter automatically.
   */
  downloadDelayMinMs: z
    .number()
    .min(0)
    .default(5 * 60 * 1000)
    .describe(
      "The shortest a newly spotted video waits before its download starts. Each item picks a random wait between this and the maximum, so a batch of new videos - and every other installation doing the same thing - doesn't all hit Digital Foundry at once."
    ),
  downloadDelayMaxMs: z
    .number()
    .min(0)
    .default(20 * 60 * 1000)
    .describe(
      "The longest a newly spotted video waits before its download starts. A wider gap from the minimum spreads the load further; a narrower one gets your videos sooner."
    ),
  /**
   * Only auto-download content published within this many hours. Guards
   * against a flood of downloads if a large batch of "new" content is ever
   * discovered at once (e.g. resuming after an upgrade that changes how
   * content is discovered) - older content still gets added to the DB, it's
   * just not auto-downloaded. Capped at one week (168h) - deliberately no
   * "unlimited" option, since that would defeat the point of the guard.
   */
  maxContentAgeHours: z
    .number()
    .min(0)
    .max(168)
    .default(24)
    .describe(
      "Only download videos published within this many hours (a week at most). Older content still appears in your library, it just isn't fetched automatically - which stops a whole backlog downloading at once after the app has been offline for a while."
    ),
  /** Exclusion filters for automatic downloads - if a content entry matches any of these filters, it will not be downloaded */
  exclusionFilters: z
    .array(ContentInfoFilter)
    .optional()
    .describe(
      "Videos matching any of these are skipped by automatic downloads - useful for series you'd rather not have filling your disk."
    ),
});
export type AutomaticDownloadsConfig = z.infer<typeof AutomaticDownloadsConfig>;
export const AutomaticDownloadsConfigKey = "automaticDownloads";
