import { DfContentEntry, UserInfo } from "df-downloader-common";
import { z } from "zod";

const DfDbBaseSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  firstRunComplete: z.boolean(),
  refetchRequired: z.boolean().optional(),
  user: UserInfo.optional(),
});

export const DfDbRuntimeSchema = DfDbBaseSchema.extend({
  contentInfo: z.array(DfContentEntry).transform((val) => {
    const toReturn = new Map<string, DfContentEntry>();
    val.forEach((entry) => {
      toReturn.set(entry.name, entry);
    });
    return toReturn;
  }),
});
export type DfDbRuntimeSchema = z.infer<typeof DfDbRuntimeSchema>;

export const DfDbFileSchema = DfDbBaseSchema.extend({
  contentInfo: z.map(z.string(), DfContentEntry).transform((val) => {
    return [...val.values()].sort((a, b) => {
      const aTime = a.contentInfo?.publishedDate?.getTime() || 0;
      const bTime = b.contentInfo?.publishedDate?.getTime() || 0;
      return aTime - bTime;
    });
  }),
});
export type DfDbFileSchema = z.infer<typeof DfDbFileSchema>;
