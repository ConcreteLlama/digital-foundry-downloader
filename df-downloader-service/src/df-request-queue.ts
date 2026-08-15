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

let lastRequestStartedAt = 0;

const waitForSpacing = async () => {
  const { requestSpacingMinMs, requestSpacingMaxMs } = configService.config.digitalFoundry;
  const targetSpacingMs = randomIntInRange(requestSpacingMinMs, requestSpacingMaxMs);
  const elapsedMs = Date.now() - lastRequestStartedAt;
  if (elapsedMs < targetSpacingMs) {
    await sleep(targetSpacingMs - elapsedMs);
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

/**
 * Drop-in replacement for `fetch()` for any request to digitalfoundry.net.
 * Queues behind every other in-flight dfFetch call, enforces a minimum
 * spacing between requests, and transparently backs off and retries on
 * 429/503 (honoring Retry-After) before returning - callers only ever see a
 * final response, never a throttling one, unless every retry is exhausted.
 */
export const dfFetch = (input: string, init?: RequestInit): Promise<Response> => {
  return dfSiteRequestQueue.addWork(async () => {
    let attempt = 0;
    while (true) {
      await waitForSpacing();
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
      await sleep(backoffMs);
    }
  });
};
