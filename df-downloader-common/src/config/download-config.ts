import { z } from "zod";

export const DownloadsConfig = z.object({
  /** The maximum number of simultaneous downloads */
  maxSimultaneousDownloads: z.number().min(1).max(10).default(2),
  /** The maximum number of connections per download */
  maxConnectionsPerDownload: z.number().min(1).max(10).default(5),
  /** How long to wait before retrying a failed download in milliseconds */
  failureRetryIntervalBase: z.number().min(1000).default(60000),
  /** The maximum number of times to retry a failed download */
  maxRetries: z.number().min(0).default(10),
  /** The maximum delay between retries in milliseconds */
  maxRetryDelay: z.number().min(0).default(600000),
  /** How much to multiply the retry delay by after each retry */
  retryDelayMultiplier: z.number().min(1).default(1.5),

  /** The maximum number of times to retry a failed connection */
  connectionMaxRetries: z.number().min(0).default(5),
  /** How long to wait before retrying a failed connection in milliseconds */
  connectionRetryDelayBase: z.number().min(0).default(1000),
  /** How much to multiply the connection retry delay by after each retry */
  connectionRetryDelayMultiplier: z.number().min(1).default(1.5),
  /** The maximum delay between connection retries in milliseconds */
  connectionMaxRetryDelay: z.number().min(0).default(60000),
});

export type DownloadsConfig = z.infer<typeof DownloadsConfig>;
export const DownloadsConfigKey = "downloads";
