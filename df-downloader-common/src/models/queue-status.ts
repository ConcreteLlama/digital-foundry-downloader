import { z } from "zod";

/**
 * What a pending Digital Foundry request is currently doing.
 *
 * `waiting` and `in_flight` are deliberately distinct: a request that has
 * reached the front of the queue spends most of its life asleep in the
 * randomized 5-15s spacing gate rather than actually talking to DF (see
 * df-request-queue.ts), and reporting that as "in flight" described a
 * request that hadn't been sent yet.
 */
export const DfRequestPhase = z.enum(["queued", "waiting", "in_flight", "backing_off"]);
export type DfRequestPhase = z.infer<typeof DfRequestPhase>;

export const DfRequestEntry = z.object({
  id: z.number(),
  /** Human-readable description of what this request is for. */
  label: z.string(),
  phase: DfRequestPhase,
  /** True for requests that skipped the queue entirely (see dfFetch's bypassQueue). */
  bypassedQueue: z.boolean(),
  priority: z.number(),
  startedWaitingAt: z.number(),
  /** Epoch ms this request expects to stop waiting, while phase is `waiting` or `backing_off`. */
  waitingUntil: z.number().nullable(),
  /** Backoff retries so far - 0 until DF actually rate-limits this request. */
  attempt: z.number(),
});
export type DfRequestEntry = z.infer<typeof DfRequestEntry>;

export const QueueStatusResponse = z.object({
  dfQueue: z.object({
    /** Jobs waiting for a turn - see df-request-queue.ts. */
    queued: z.number(),
    /** 1 while a request is actually in flight (or waiting out the spacing gate before one), 0 otherwise - the queue is concurrency 1. */
    active: z.number(),
    /** Epoch ms the current 429/503 backoff ends, or null if not backing off. */
    backingOffUntil: z.number().nullable(),
    /**
     * Every tracked request, whatever it's doing - ordered as the queue
     * will service them. The counts above can't distinguish "0 queued but
     * one in flight" from "nothing happening", which read as
     * self-contradictory; this says what each request actually is.
     */
    requests: z.array(DfRequestEntry),
  }),
  /** Mirrors DigitalFoundryContentManager.scanInProgress. */
  scanInProgress: z.boolean(),
  /**
   * Whether a new-content check is currently walking listing pages. Distinct
   * from scanInProgress, which covers archive walks and metadata refreshes.
   */
  newContentCheckInProgress: z.boolean(),
  /**
   * Whether there's a confirmed Digital Foundry session. Scans hard no-op
   * without one, so the UI needs this to explain why rather than offering
   * an action that would silently do nothing.
   */
  signedInToDf: z.boolean(),
});
export type QueueStatusResponse = z.infer<typeof QueueStatusResponse>;
