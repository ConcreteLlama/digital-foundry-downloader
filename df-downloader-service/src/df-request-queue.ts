import { logger, randomIntInRange } from "df-downloader-common";
import { configService } from "./config/config.js";
import { WorkerQueue } from "./utils/queue-utils.js";

/**
 * Single gate for every HTTP request this app makes to digitalfoundry.net
 * itself (listing/auth-check requests - NOT downloads, which after the
 * initial listing scrape land on a signed CDN URL rather than DF's own
 * origin). Digital Foundry is a small team, not a large CDN-subsidized
 * operation - see docs/DF_SITE_MIGRATION.md's incident writeup for what
 * happens when this isn't respected (a real Cloudflare IP ban during
 * testing). Every caller (df-fetcher.ts's listing/auth-check requests) must
 * go through `dfFetch()` rather than calling `fetch()` directly.
 *
 * Two independent protections:
 * 1. Strictly serialized (concurrency 1) with a randomized minimum spacing
 *    between requests (see digitalFoundry.requestSpacingMinMs/MaxMs in
 *    df-config.ts - hard-floored at 5s, defaults to 5-15s), regardless of
 *    how many logical operations are in flight above this (e.g.
 *    refreshMeta's batch of concurrent per-item lookups - see
 *    df-content-manager.ts). Multiple callers queuing up here is exactly the
 *    point; it's what stops e.g. 5 concurrent metadata refreshes from
 *    turning into 5 concurrent bursts of requests. Randomized (not fixed)
 *    so a scan doesn't look like a metronome.
 * 2. Transparent backoff-and-retry on 429/503 responses, honoring
 *    `Retry-After` when the server sends one, so a real rate limit is a
 *    slowdown rather than a wall of retried failures.
 */

const DEFAULT_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const MAX_RETRIES_PER_REQUEST = 5;
const THROTTLE_STATUS_CODES = new Set([429, 503]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const dfSiteRequestQueue = new WorkerQueue({ namePrefix: "df-site-request", concurrent: 1 });

/**
 * Bulk/background work (archive scans, batch metadata refreshes) uses the
 * default priority (0) and queues normally. A single on-demand lookup
 * directly blocking a user action (e.g. refreshing an item's media info
 * right before downloading it, or checking a just-pasted session ID) should
 * jump ahead of that backlog rather than wait its turn behind however many
 * scan pages are still queued - confirmed live 2026-08-18 that this made the
 * "Available" download button appear to do nothing for minutes during a
 * scan. Doesn't bypass the spacing/backoff protections above, just where in
 * the line a request starts.
 */
export const DfFetchPriority = {
  BACKGROUND: 0,
  INTERACTIVE: 10,
} as const;

let lastRequestStartedAt = 0;
/** Epoch ms until which a 429/503 backoff is in progress, or 0 if none - surfaced via getDfRequestQueueStatus for the UI's queue indicator. */
let backingOffUntil = 0;

/**
 * What a tracked request is currently doing. The distinction between
 * `waiting` and `in_flight` is the whole point of tracking these: a request
 * that has reached the front of the queue spends most of its life asleep in
 * the spacing gate (5-15s) rather than actually talking to DF, so a bare
 * "request in flight: yes" was reporting a request that hadn't been sent.
 */
export type DfRequestPhase = "queued" | "waiting" | "in_flight" | "backing_off";

export type DfRequestEntry = {
  id: number;
  /** Human-readable description of what this request is for. */
  label: string;
  phase: DfRequestPhase;
  /** True for requests that skipped the queue entirely (see dfFetch's bypassQueue). */
  bypassedQueue: boolean;
  priority: number;
  startedWaitingAt: number;
  /** Epoch ms this request expects to stop waiting, while phase is `waiting` or `backing_off`. */
  waitingUntil: number | null;
  /** Backoff retries so far - 0 until DF actually rate-limits this request. */
  attempt: number;
};

let nextRequestId = 1;
const trackedRequests = new Map<number, DfRequestEntry>();

/**
 * Fallback label for a caller that didn't supply one. Never shows the raw
 * query string - it carries the listing API's internal params, which mean
 * nothing to someone reading the queue popover.
 */
const describeRequest = (input: string): string => {
  try {
    const url = new URL(input);
    const offset = url.searchParams.get("offset");
    if (offset !== null) {
      const limit = Number(url.searchParams.get("limit")) || 50;
      const start = Number(offset);
      return `Listing items ${start + 1}-${start + limit}`;
    }
    return `Request to ${url.pathname}`;
  } catch {
    return "Digital Foundry request";
  }
};

const trackRequest = (label: string, priority: number, bypassedQueue: boolean): DfRequestEntry => {
  const entry: DfRequestEntry = {
    id: nextRequestId++,
    label,
    phase: bypassedQueue ? "in_flight" : "queued",
    bypassedQueue,
    priority,
    startedWaitingAt: Date.now(),
    waitingUntil: null,
    attempt: 0,
  };
  trackedRequests.set(entry.id, entry);
  return entry;
};

const waitForSpacing = async (entry?: DfRequestEntry) => {
  const { requestSpacingMinMs, requestSpacingMaxMs } = configService.config.digitalFoundry;
  const targetSpacingMs = randomIntInRange(requestSpacingMinMs, requestSpacingMaxMs);
  const elapsedMs = Date.now() - lastRequestStartedAt;
  if (elapsedMs < targetSpacingMs) {
    const waitMs = targetSpacingMs - elapsedMs;
    if (entry) {
      entry.phase = "waiting";
      entry.waitingUntil = Date.now() + waitMs;
    }
    await sleep(waitMs);
  }
  if (entry) {
    entry.phase = "in_flight";
    entry.waitingUntil = null;
  }
  lastRequestStartedAt = Date.now();
};

/** Parses Retry-After as either delta-seconds or an HTTP-date - both are valid per RFC 9110. */
const parseRetryAfterMs = (response: Response): number | undefined => {
  const header = response.headers.get("retry-after");
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
};

const runWithBackoff = async (input: string, init?: RequestInit, entry?: DfRequestEntry): Promise<Response> => {
  let attempt = 0;
  while (true) {
    if (entry) {
      entry.phase = "in_flight";
      entry.waitingUntil = null;
    }
    const response = await fetch(input, init);
    if (!THROTTLE_STATUS_CODES.has(response.status)) {
      return response;
    }
    attempt++;
    if (attempt > MAX_RETRIES_PER_REQUEST) {
      logger.log(
        "error",
        `digitalfoundry.net still responding ${response.status} for ${input} after ${attempt - 1} backoff retries - giving up and returning the response as-is`
      );
      return response;
    }
    const retryAfterMs = parseRetryAfterMs(response);
    const backoffMs = retryAfterMs ?? Math.min(DEFAULT_BACKOFF_MS * attempt, MAX_BACKOFF_MS);
    logger.log(
      "warn",
      `digitalfoundry.net responded ${response.status} for ${input} - backing off ${backoffMs}ms before retry ${attempt}/${MAX_RETRIES_PER_REQUEST}${retryAfterMs !== undefined ? " (honoring Retry-After)" : ""}`
    );
    backingOffUntil = Date.now() + backoffMs;
    if (entry) {
      entry.phase = "backing_off";
      entry.waitingUntil = backingOffUntil;
      entry.attempt = attempt;
    }
    await sleep(backoffMs);
    backingOffUntil = 0;
  }
};

/**
 * Snapshot of the DF-site request queue for the UI's queue-status
 * indicator, including what each pending request actually is.
 *
 * The counts alone were genuinely confusing to read: with a single request
 * being serviced the popover said "queued: 0" and "in flight: yes", which
 * looks self-contradictory unless you know `queued` counts only the ones
 * still waiting their turn. Worse, "in flight" was true while the request
 * was merely sleeping through the spacing gate and hadn't been sent at all.
 * `requests` carries the per-request phase so the UI can say which of those
 * is actually happening, and to what.
 */
export const getDfRequestQueueStatus = () => ({
  queued: dfSiteRequestQueue.queuedJobs,
  active: dfSiteRequestQueue.activeJobs,
  backingOffUntil: backingOffUntil || null,
  requests: Array.from(trackedRequests.values())
    // Whatever is actually happening first, then the queue in the order it
    // will be serviced: higher priority first, then oldest first (matching
    // WorkerQueue's priority comparator).
    .sort((a, b) => {
      const phaseRank = (entry: DfRequestEntry) => (entry.phase === "queued" ? 1 : 0);
      return (
        phaseRank(a) - phaseRank(b) || b.priority - a.priority || a.startedWaitingAt - b.startedWaitingAt
      );
    })
    .map((entry) => ({ ...entry })),
});

/**
 * Drop-in replacement for `fetch()` for any request to digitalfoundry.net.
 * Queues behind every other in-flight dfFetch call, enforces a minimum
 * spacing between requests, and transparently backs off and retries on
 * 429/503 (honoring Retry-After) before returning - callers only ever see a
 * final response, never a throttling one, unless every retry is exhausted.
 *
 * `bypassQueue` skips both the queue and the artificial human-cadence
 * spacing entirely - for a single, deliberate one-off request (e.g. the
 * live link refresh right before a manual download), not bulk/automated
 * work. Confirmed live 2026-08-18 that even jumping the priority queue
 * still left a real download stuck behind the ~5-15s spacing gate if a scan
 * had just fired a request. Still fully honors the 429/503 backoff below -
 * that's the site's own signal to slow down, never optional - and still
 * updates the shared spacing clock so a subsequent *queued* request doesn't
 * immediately follow this one too closely.
 */
export const dfFetch = async (
  input: string,
  init?: RequestInit,
  opts: { priority?: number; bypassQueue?: boolean; label?: string } = {}
): Promise<Response> => {
  const priority = opts.priority ?? DfFetchPriority.BACKGROUND;
  const entry = trackRequest(opts.label || describeRequest(input), priority, Boolean(opts.bypassQueue));
  try {
    if (opts.bypassQueue) {
      lastRequestStartedAt = Date.now();
      return await runWithBackoff(input, init, entry);
    }
    return await dfSiteRequestQueue.addWork(
      async () => {
        await waitForSpacing(entry);
        return runWithBackoff(input, init, entry);
      },
      { priority: opts.priority }
    );
  } finally {
    trackedRequests.delete(entry.id);
  }
};
