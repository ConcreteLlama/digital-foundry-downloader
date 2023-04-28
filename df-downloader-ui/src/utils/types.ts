/**
 * Have to replicate these here as for some reason TS doesn't correctly export the type guards in the d.ts file
 */

import {
  DfContentStatus,
  DfContentStatusInfo,
  DfContentStatusInfoDownloaded,
  DfContentStatusInfoPaywalled,
} from "df-downloader-common";

export const isAvailableContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfo => {
  return status.status === DfContentStatus.AVAILABLE;
};

export const isAttemptingDownloadContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfo => {
  return status.status === DfContentStatus.ATTEMPTING_DOWNLOAD;
};

export const isPaywalledContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfoPaywalled => {
  return status.status === DfContentStatus.CONTENT_PAYWALLED;
};

export const isDownloadedContentStatus = (status: DfContentStatusInfo): status is DfContentStatusInfoDownloaded => {
  return status.status === DfContentStatus.DOWNLOADED;
};
