import { z } from "zod";
import { ContentInfoFilter } from "../models/filter.js";

export const AutomaticDownloadsConfig = z.object({
  /** Whether automatic downloads are enabled */
  enabled: z.boolean().default(false),
  /**
   * Delay after detecting new content before starting the download, in
   * milliseconds - a random value is picked between these two bounds for
   * each piece of content individually, so simultaneous checks (across many
   * self-hosted installations, not just multiple items in one check) don't
   * all start downloading from Digital Foundry's CDN at the same instant.
   * Defaults to a 5-20 minute spread so installs that never touch this
   * setting still add some jitter automatically.
   */
  downloadDelayMinMs: z.number().min(0).default(5 * 60 * 1000),
  downloadDelayMaxMs: z.number().min(0).default(20 * 60 * 1000),
  /**
   * Only auto-download content published within this many hours. Guards
   * against a flood of downloads if a large batch of "new" content is ever
   * discovered at once (e.g. resuming after an upgrade that changes how
   * content is discovered) - older content still gets added to the DB, it's
   * just not auto-downloaded. Capped at one week (168h) - deliberately no
   * "unlimited" option, since that would defeat the point of the guard.
   */
  maxContentAgeHours: z.number().min(0).max(168).default(48),
  /** Exclusion filters for automatic downloads - if a content entry matches any of these filters, it will not be downloaded */
  exclusionFilters: z.array(ContentInfoFilter).optional(),
});
export type AutomaticDownloadsConfig = z.infer<typeof AutomaticDownloadsConfig>;
export const AutomaticDownloadsConfigKey = "automaticDownloads";
