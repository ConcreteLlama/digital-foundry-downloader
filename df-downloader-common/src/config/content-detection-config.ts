import { z } from "zod";
import { zUndefinedInfinity } from "./utils.js";

export const ContentDetectionConfig = z.object({
  /**
   * How often to check for new content, in milliseconds. Digital Foundry
   * publishes at most a few times a day and is a small team's
   * infrastructure, not a CDN-subsidized one - the old 60s default (a
   * holdover from the pre-relaunch site) was far too aggressive for the new
   * site's request pacing (see docs/DF_SITE_MIGRATION.md).
   *
   * Deliberately NOT raising the min() floor alongside the default - config
   * values are validated as-is on load with no patch/migration step (unlike
   * the DB, see FileDb's patchRoutine), so tightening a min() here would
   * hard-crash startup for any existing install with an explicit lower
   * value already persisted (confirmed live 2026-08-15 against this repo's
   * own dev config, which still had the old 59998ms default saved). Only
   * new installs (or ones that never touched this setting) get the safer
   * default; existing explicit configs are left alone.
   */
  contentCheckInterval: z.number().min(30000).default(30 * 60 * 1000),
  /** The maximum number of pages to check for new content */
  maxArchivePage: z.number().min(1).default(1000000),
});
export type ContentDetectionConfig = z.infer<typeof ContentDetectionConfig>;
export const ContentDetectionConfigKey = "contentDetection";
