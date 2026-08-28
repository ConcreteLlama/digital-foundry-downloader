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
  /**
   * Seconds left at the current rate, or undefined when that cannot be
   * answered - matching estimateProgressTimeRemainingMs, so callers render
   * nothing rather than a guess.
   *
   * The rate is genuinely 0 whenever bytes have stopped arriving: samples
   * older than 3s are ignored (see DownloadConnectionProgressInfo), so a
   * paused download reports exactly zero within a few seconds. This used to
   * fall back to `|| 1`, i.e. one byte per second, which turned "no idea" into
   * a confident finite number - a paused 6GB download at 23.71% reported about
   * 641286h, roughly 73 years. Dividing by a made-up rate is the bug; the
   * pause is not.
   */
  calculateTimeRemainingSeconds(progress: DownloadProgressInfo): number | undefined {
    const { totalBytes, totalBytesDownloaded, currentBytesPerSecond } = progress;
    const bytesRemaining = totalBytes - totalBytesDownloaded;
    if (!currentBytesPerSecond || currentBytesPerSecond <= 0 || bytesRemaining <= 0) {
      return undefined;
    }
    return Math.min(bytesRemaining / currentBytesPerSecond, Number.MAX_SAFE_INTEGER);
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