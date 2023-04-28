import { z } from "zod";

export enum DfContentStatus {
  AVAILABLE = "AVAILABLE",
  CONTENT_PAYWALLED = "CONTENT_PAYWALLED",
  ATTEMPTING_DOWNLOAD = "ATTEMPTING_DOWNLOAD",
  DOWNLOADED = "DOWNLOADED",
}

export const DfContentStatusInfo = z.object({
  status: z.nativeEnum(DfContentStatus),
});
export type DfContentStatusInfo = z.infer<typeof DfContentStatusInfo>;

export const DfContentStatusInfoDownloaded = DfContentStatusInfo.extend({
  status: z.literal(DfContentStatus.DOWNLOADED),
  format: z.string(),
  downloadDate: z.coerce.date(),
  downloadLocation: z.string(),
  size: z.string().optional(),
});
export type DfContentStatusInfoDownloaded = z.infer<typeof DfContentStatusInfoDownloaded>;

export const DfContentStatusInfoPaywalled = DfContentStatusInfo.extend({
  status: z.literal(DfContentStatus.CONTENT_PAYWALLED),
  userTierWhenUnavailable: z.string(),
});
export type DfContentStatusInfoPaywalled = z.infer<typeof DfContentStatusInfoPaywalled>;

//Make a create for each type of DfContentStatusInfo
export const DfContentStatusInfoUtils = {
  createAvailable: (): DfContentStatusInfo => ({
    status: DfContentStatus.AVAILABLE,
  }),
  createAttemptingDownload: (): DfContentStatusInfo => ({
    status: DfContentStatus.ATTEMPTING_DOWNLOAD,
  }),
  createPaywalled: (userTierWhenUnavailable: string): DfContentStatusInfoPaywalled => ({
    status: DfContentStatus.CONTENT_PAYWALLED,
    userTierWhenUnavailable,
  }),
  createDownloaded: (
    format: string,
    downloadDate: Date,
    downloadLocation: string,
    size?: string
  ): DfContentStatusInfoDownloaded => ({
    status: DfContentStatus.DOWNLOADED,
    format,
    downloadDate,
    downloadLocation,
    size,
  }),
};

// There are really placeholders for if I ever add more detail into these basic status
// Note: These don't seem to be exported properly on .d.ts, so I can't use them in the code - leaving here in case I can figure out why
// otherwise code needing type guards needs to be in the relevant package
// export const isAvailableContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfo => {
//   return status.status === DfContentStatus.AVAILABLE;
// };

// export const isAttemptingDownloadContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfo => {
//   return status.status === DfContentStatus.ATTEMPTING_DOWNLOAD;
// };

// export const isPaywalledContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfoPaywalled => {
//   return status.status === DfContentStatus.CONTENT_PAYWALLED;
// };

// export const isDownloadedContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfoDownloaded => {
//   return status.status === DfContentStatus.DOWNLOADED;
// };
