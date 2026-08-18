import { z } from "zod";

export const QueueStatusResponse = z.object({
  dfQueue: z.object({
    /** Jobs waiting for a turn - see df-request-queue.ts. */
    queued: z.number(),
    /** 1 while a request is actually in flight (or waiting out the spacing gate before one), 0 otherwise - the queue is concurrency 1. */
    active: z.number(),
    /** Epoch ms the current 429/503 backoff ends, or null if not backing off. */
    backingOffUntil: z.number().nullable(),
  }),
  /** Mirrors DigitalFoundryContentManager.scanInProgress. */
  scanInProgress: z.boolean(),
});
export type QueueStatusResponse = z.infer<typeof QueueStatusResponse>;
