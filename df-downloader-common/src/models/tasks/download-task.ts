import { z } from "zod";
import { BasicTaskInfo, TaskStatus } from "./base-task-info.js";

export const DownloadProgressInfo = z.object({
  startTime: z.coerce.date().optional(),
  runningTime: z.number(),
  totalBytesDownloaded: z.number(),
  totalBytes: z.number(),
  retries: z.number(),
  percentComplete: z.number(),
  currentBytesPerSecond: z.number(),
  averageBytesPerSecond: z.number(),
});
export type DownloadProgressInfo = z.infer<typeof DownloadProgressInfo>;

export const DownloadProgressUtils = {
  calculateTimeRemainingSeconds(progress: DownloadProgressInfo): number {
    const { totalBytes, totalBytesDownloaded, currentBytesPerSecond } = progress;
    const bytesRemaining = totalBytes - totalBytesDownloaded;
    return Math.min(bytesRemaining / (currentBytesPerSecond || 1), Number.MAX_SAFE_INTEGER);
  },
};

export const calculateTimeRemainingSeconds = (
  totalBytesDownloaded: number,
  totalBytes: number,
  currentBytesPerSecond: number
) => {
  const bytesRemaining = totalBytes - totalBytesDownloaded;
  return Math.min(bytesRemaining / (currentBytesPerSecond || 1), Number.MAX_SAFE_INTEGER);
};

export const DownloadTaskStatus = TaskStatus.extend({
  currentProgress: DownloadProgressInfo.optional(),
});
export type DownloadTaskStatus = z.infer<typeof DownloadTaskStatus>;

export const DOWNLOAD_TASK_TYPE = "download";
export const DownloadTaskInfo = BasicTaskInfo.extend({
  taskType: z.literal(DOWNLOAD_TASK_TYPE),
  status: DownloadTaskStatus.nullable(),
});
export type DownloadTaskInfo = z.infer<typeof DownloadTaskInfo>;

export const isDownloadTaskInfo = (task?: any | null): task is DownloadTaskInfo => {
  return task?.taskType === "download";
};