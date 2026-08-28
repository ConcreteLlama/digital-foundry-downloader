import { z } from "zod";

export const DownloadsConfig = z.object({
  /** The maximum number of simultaneous downloads */
  maxSimultaneousDownloads: z
    .number()
    .min(1)
    .max(10)
    .default(2)
    .describe(
      "How many downloads may run at the same time. More is not automatically faster - past the point your connection is saturated they simply slow each other down."
    ),
  /** The maximum number of connections per download */
  maxConnectionsPerDownload: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe(
      "How many connections a single download opens. More can pull a file down faster, at the cost of being heavier on the server serving it."
    ),
  /** How long to wait before retrying a failed download in milliseconds */
  failureRetryIntervalBase: z
    .number()
    .min(1000)
    .default(60000)
    .describe("How long to wait before the first retry of a failed download. Each further attempt waits longer than the last."),
  /** The maximum number of times to retry a failed download */
  maxRetries: z.number().min(0).default(10).describe("How many times to retry a failed download before giving up on it."),
  /** The maximum delay between retries in milliseconds */
  maxRetryDelay: z
    .number()
    .min(0)
    .default(600000)
    .describe("A ceiling on the wait between download retries, so the back-off cannot keep growing indefinitely."),
  /** How much to multiply the retry delay by after each retry */
  retryDelayMultiplier: z
    .number()
    .min(1)
    .default(1.5)
    .describe(
      "How much longer each download retry waits than the one before it. Higher values back off faster when something is persistently wrong."
    ),

  /** The maximum number of times to retry a failed connection */
  connectionMaxRetries: z
    .number()
    .min(0)
    .default(5)
    .describe(
      "How many times to retry a single dropped connection within a download before the download as a whole is treated as failed."
    ),
  /** How long to wait before retrying a failed connection in milliseconds */
  connectionRetryDelayBase: z
    .number()
    .min(0)
    .default(1000)
    .describe("How long to wait before retrying a dropped connection within a download."),
  /** How much to multiply the connection retry delay by after each retry */
  connectionRetryDelayMultiplier: z
    .number()
    .min(1)
    .default(1.5)
    .describe("How much longer each connection retry waits than the one before it."),
  /** The maximum delay between connection retries in milliseconds */
  connectionMaxRetryDelay: z
    .number()
    .min(0)
    .default(60000)
    .describe("A ceiling on the wait between connection retries within a download."),
});

export type DownloadsConfig = z.infer<typeof DownloadsConfig>;
export const DownloadsConfigKey = "downloads";
