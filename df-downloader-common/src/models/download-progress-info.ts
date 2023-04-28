import { z } from "zod";

export const DownloadProgressInfo = z.object({
  totalBytesDownloaded: z.number(),
  totalBytes: z.number(),
  retries: z.number(),
  percentComplete: z.number(),
  bytesPerSecond: z.number(),
  startTime: z.coerce.date(),
  durationMillis: z.number(),
  averageBytesPerSecond: z.number(),
});
export type DownloadProgressInfo = z.infer<typeof DownloadProgressInfo>;

export const DownloadProgressUtils = {
  calculateTimeRemainingSeconds(progress: DownloadProgressInfo): number {
    const { totalBytes, totalBytesDownloaded, bytesPerSecond } = progress;
    const bytesRemaining = totalBytes - totalBytesDownloaded;
    return Math.min(bytesRemaining / bytesPerSecond, Number.MAX_SAFE_INTEGER);
  },
};
