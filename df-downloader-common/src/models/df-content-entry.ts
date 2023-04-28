import { z } from "zod";
import { DfContentInfo, DfContentInfoUtils } from "./df-content-info.js";
import {
  DfContentStatusInfo,
  DfContentStatusInfoDownloaded,
  DfContentStatusInfoPaywalled,
} from "./df-content-status.js";

export const DfContentEntry = z.object({
  name: z.string(),
  dataVersion: z.string(),
  contentInfo: DfContentInfo,
  statusInfo: z.union([DfContentStatusInfoDownloaded, DfContentStatusInfoPaywalled, DfContentStatusInfo]),
});
export type DfContentEntry = z.infer<typeof DfContentEntry>;

export const DfContentEntryUtils = {
  create: (name: string, contentInfo: DfContentInfo, statusInfo: DfContentStatusInfo): DfContentEntry => ({
    name,
    dataVersion: "2.0.0",
    contentInfo,
    statusInfo,
  }),
  getTotalDuration: (dfContentEntries: DfContentEntry[]): number => {
    return DfContentInfoUtils.getTotalDuration(dfContentEntries.map((dfContentEntry) => dfContentEntry.contentInfo));
  },
};

export const isContentEntry = (contentInfo: DfContentInfo | DfContentEntry): contentInfo is DfContentEntry => {
  return Boolean((contentInfo as DfContentEntry).contentInfo);
};
