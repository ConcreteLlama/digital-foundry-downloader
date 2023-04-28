import { z } from "zod";
import { DownloadProgressInfo } from "./download-progress-info.js";
import { DfContentInfo } from "./df-content-info.js";
import { MediaInfo } from "./media-info.js";

export enum QueuedContentStatus {
  QUEUED = "QUEUED",
  PENDING_RETRY = "PENDING_RETRY",
  DOWNLOADING = "DOWNLOADING",
  POST_PROCESSING = "POST_PROCESSING",
  DONE = "DONE",
}
export const QueuedContent = z.object({
  name: z.string(),
  currentRetryInterval: z.number(),
  originalDetectionTime: z.coerce.date(),
  currentAttempt: z.number(),
  readyForRetry: z.boolean().optional(),
  contentStatus: z.nativeEnum(QueuedContentStatus),
  statusInfo: z.string().optional(),
  currentProgress: DownloadProgressInfo.optional(),
  dfContent: DfContentInfo,
  selectedMediaInfo: MediaInfo,
});
export type QueuedContent = z.infer<typeof QueuedContent>;

export const QueuedContentUtils = {
  create: (
    name: string,
    currentRetryInterval: number,
    originalDetectionTime: Date,
    dfContent: DfContentInfo,
    selectedMediaInfo: MediaInfo
  ): QueuedContent => ({
    name,
    currentRetryInterval,
    originalDetectionTime,
    currentAttempt: 0,
    readyForRetry: false,
    contentStatus: QueuedContentStatus.QUEUED,
    statusInfo: undefined,
    currentProgress: undefined,
    dfContent,
    selectedMediaInfo,
  }),

  newAttempt: (queuedContent: QueuedContent): void => {
    queuedContent.readyForRetry = false;
    queuedContent.currentAttempt++;
    queuedContent.currentRetryInterval *= 2;
  },
};

export const QueueDownloadRequest = z.object({
  name: z.string(),
  mediaType: z.string().optional(),
});
export type QueueDownloadRequest = z.infer<typeof QueueDownloadRequest>;
