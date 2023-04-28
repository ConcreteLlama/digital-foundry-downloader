import { z } from "zod";

export const DownloadsConfig = z.object({
  maxSimultaneousDownloads: z.number().min(1).max(10).default(2),
  maxConnectionsPerDownload: z.number().min(1).max(10).default(5),
  failureRetryIntervalBase: z.number().min(1000).default(60000),
  maxRetries: z.number().min(0).default(10),
});

export type DownloadsConfig = z.infer<typeof DownloadsConfig>;
export const DownloadsConfigKey = "downloads";
