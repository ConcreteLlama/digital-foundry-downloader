import { z } from "zod";

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
