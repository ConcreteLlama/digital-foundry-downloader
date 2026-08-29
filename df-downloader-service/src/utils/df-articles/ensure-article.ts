import { DfArticle, DfArticleLookupState, DfArticleUtils, DfContentInfo, logger } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";
import { findArticleForContent } from "./article-lookup.js";

/**
 * The lazy, retry-capable entry point for article matching.
 *
 * Everything that wants an article goes through here rather than calling
 * the lookup directly, because the caching rules are the substance of this
 * feature and must not be re-decided per caller:
 *
 * - **A found article is permanent.** It was verified by comparing the
 *   article's embedded video ID against the content's own, and that cannot
 *   stop being true, so it is never searched for again.
 *
 * - **A miss is never permanent.** Patreon content is often early access,
 *   so a video routinely exists days or weeks before its companion article
 *   - if one is ever written. Treating "not found" as settled would
 *   silently lose every match that a later attempt would have made, and
 *   nothing in the UI would ever hint that it had. This is the one place
 *   the design deliberately departs from the YouTube description/duration
 *   backfill it is otherwise modelled on: there, a miss really does mean
 *   the data is not available.
 *
 * - **Retries are spaced, not counted.** A miss backs off (6h, 1d, 3d, 1w
 *   and then steady) so that repeatedly opening a panel does not re-search
 *   the site, but there is no attempt count at which it gives up, because
 *   there is no number of failures that makes "not written yet" less
 *   plausible.
 *
 * Never triggered by the archive scan or the polling loop - only by
 * something a person did (opening a content panel) or by an analysis run
 * that is about to need the text. A per-item site search folded into the
 * scan would multiply the scan's request count by the size of the library,
 * against a site that asks for a five-second crawl delay.
 */
export const ensureArticleForContent = async (
  db: DfDownloaderOperationalDb,
  contentInfo: DfContentInfo,
  opts: { priority?: number; force?: boolean } = {}
): Promise<DfArticle | undefined> => {
  const contentKey = contentInfo.key;
  const existing = await db.getDfArticleLookup(contentKey);

  if (existing?.article && !opts.force) {
    return existing.article;
  }
  if (!opts.force && !DfArticleUtils.shouldRetry(existing)) {
    logger.log(
      "debug",
      `Article lookup for ${contentKey} is in backoff until ${existing ? DfArticleUtils.nextRetryAt(existing)?.toISOString() : "?"}`
    );
    return undefined;
  }

  let outcome;
  try {
    outcome = await findArticleForContent(contentInfo, { priority: opts.priority });
  } catch (e) {
    // A failure to reach the site is recorded like any other miss rather
    // than propagated: the caller wants an article or nothing, and an
    // outage is not a reason to fail an analysis that can proceed without
    // one.
    const message = e instanceof Error ? e.message : String(e);
    logger.log("warn", `Article lookup failed for ${contentKey}: ${message}`);
    await recordMiss(db, contentKey, existing, message);
    return undefined;
  }

  if (outcome.status === "found") {
    const state: DfArticleLookupState = {
      contentKey,
      article: outcome.article,
      lastAttemptedAt: new Date(),
      // Reset rather than preserved: the miss count exists only to space
      // future retries, and there are none once an article is found.
      missCount: 0,
    };
    await db.setDfArticleLookup(state);
    return outcome.article;
  }

  await recordMiss(db, contentKey, existing, outcome.reason);
  return undefined;
};

const recordMiss = async (
  db: DfDownloaderOperationalDb,
  contentKey: string,
  existing: DfArticleLookupState | undefined,
  reason: string
) => {
  await db.setDfArticleLookup({
    contentKey,
    lastAttemptedAt: new Date(),
    missCount: (existing?.missCount ?? 0) + 1,
    lastError: reason,
  });
};
