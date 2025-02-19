import { DfContentAvailabilityInfo, DfContentDownloadInfo, DfContentInfo, DfUserInfo } from "df-downloader-common";
import { z } from "zod";

export const DfDbSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
});

export const DfDbRuntimeSchema = DfDbSchema.extend({
  contentInfo: z.record(z.string(), DfContentInfo),
});
export type DfDbRuntimeSchema = z.infer<typeof DfDbRuntimeSchema>;

export const DfUserDbSchema = DfDbSchema.extend({
  user: DfUserInfo.optional(),
});
export type DfUserDbSchema = z.infer<typeof DfUserDbSchema>;

export const DfContentStatusEntry = z.object({
  availability: DfContentAvailabilityInfo,
  downloads: DfContentDownloadInfo.array(),
});

export type DfContentStatusEntry = z.infer<typeof DfContentStatusEntry>;
export const DfContentStatusDbSchema = DfDbSchema.extend({
  firstRunComplete: z.boolean(),
  contentStatuses: z.record(z.string(), DfContentStatusEntry),
});
export type DfContentStatusDbSchema = z.infer<typeof DfContentStatusDbSchema>;