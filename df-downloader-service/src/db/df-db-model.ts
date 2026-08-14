import { DfContentAvailabilityInfo, DfContentDownloadInfo, DfContentInfo, DfUserInfo, UserInfo } from "df-downloader-common";
import { z } from "zod";

export const DfDbSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
});

export const DfContentInfoDbSchema = DfDbSchema.extend({
  contentInfo: z.record(z.string(), DfContentInfo),
});
export type DfContentInfoDbSchema = z.infer<typeof DfContentInfoDbSchema>;

export const DfUserDbSchema = DfDbSchema.extend({
  dfUser: DfUserInfo.optional(),
});
export type DfUserDbSchema = z.infer<typeof DfUserDbSchema>;

export const DfContentStatusEntry = z.object({
  availability: DfContentAvailabilityInfo,
  downloads: DfContentDownloadInfo.array(),
});

export type DfContentStatusEntry = z.infer<typeof DfContentStatusEntry>;
export const DfContentStatusDbSchema = DfDbSchema.extend({
  firstRunComplete: z.boolean(),
  /**
   * Whether this installation has ever completed a full archive scan against
   * the post-relaunch site. Used to suppress auto-download on the very first
   * checkForNewContents() call for a given install (everything looks "new"
   * relative to a DB that's never been reconciled against this site before,
   * even for an install that ran yesterday against the old site) - see the
   * "Resuming after upgrading to this version" section of
   * docs/DF_SITE_MIGRATION.md.
   */
  newSiteFirstScanComplete: z.boolean(),
  contentStatuses: z.record(z.string(), DfContentStatusEntry),
});
export type DfContentStatusDbSchema = z.infer<typeof DfContentStatusDbSchema>;