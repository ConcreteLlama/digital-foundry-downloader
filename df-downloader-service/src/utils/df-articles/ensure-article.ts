import { DfArticle, DfArticleLookupState, DfArticleRef, DfArticleUtils, DfContentInfo, logger } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";
import { ArticleByproduct, findArticleForContent } from "./article-lookup.js";

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
    outcome = await findArticleForContent(contentInfo, {
      priority: opts.priority,
      seenUrls: new Set((existing?.relatedArticles ?? []).map((article) => article.url)),
      db,
    });
  } catch (e) {
    // A failure to reach the site is recorded like any other miss rather
    // than propagated: the caller wants an article or nothing, and an
    // outage is not a reason to fail an analysis that can proceed without
    // one.
    const message = e instanceof Error ? e.message : String(e);
    logger.log("warn", `Article lookup failed for ${contentKey}: ${message}`);
    await recordMiss(db, contentKey, existing, message, []);
    return undefined;
  }

  await fileByproducts(db, outcome.byproducts, contentKey);

  if (outcome.status === "found") {
    const state: DfArticleLookupState = DfArticleUtils.withRelated(
      {
        contentKey,
        article: outcome.article,
        relatedArticles: existing?.relatedArticles ?? [],
        lastAttemptedAt: new Date(),
        // Reset rather than preserved: the miss count exists only to space
        // future retries, and there are none once an article is found.
        missCount: 0,
      },
      outcome.related
    );
    await db.setDfArticleLookup(state);
    return outcome.article;
  }

  await recordMiss(db, contentKey, existing, outcome.reason, outcome.related);
  return undefined;
};

/**
 * Stores articles that were fetched while looking for something else.
 *
 * Verifying a candidate means fetching the page, and the page says which
 * videos it belongs to. When those are not the video being searched for,
 * the old behaviour discarded a definitive, already-paid-for answer about
 * some other item. Rejected candidates are also not a random sample: the
 * title-and-date scoring means they are usually another video about the
 * same game, which is exactly the content most likely to be in the library
 * as well.
 *
 * Nothing here costs a request - every article was already downloaded.
 *
 * How a page is filed depends on how many videos it embeds, which is the
 * same distinction the main lookup makes. One video: it is that video's
 * companion piece, filed as the primary article. Several: it is a
 * round-up, filed as related reading against every one of them that is in
 * the library - worth having, but never used as grounding, since most of
 * its text is about the other videos.
 *
 * Two things it deliberately does not do. It never overwrites an existing
 * primary, because that one was confirmed the same way and there is
 * nothing to gain. And it never *creates* a lookup record for content that
 * is not in the library, which would accumulate entries for videos the
 * user does not have.
 */
const fileByproducts = async (
  db: DfDownloaderOperationalDb,
  byproducts: ArticleByproduct[],
  searchedFor: string
) => {
  for (const { ref, videoIds, text } of byproducts) {
    const isCompanionPiece = videoIds.length === 1;
    // A companion piece is stored with the body an analysis reads, so it
    // can only be filed when the page was actually fetched. On a cache
    // hit there is nothing to file anyway - that filing happened the
    // first time the page was read.
    if (isCompanionPiece && !text) {
      continue;
    }
    for (const videoId of videoIds) {
      // Content keys are "yt-<videoId>" for anything with a YouTube link,
      // which is every item that could have matched an article in the
      // first place - an article is only ever identified by its embedded
      // video.
      const otherKey = `yt-${videoId}`;
      if (otherKey === searchedFor) {
        continue;
      }
      try {
        if (!(await db.getContentEntry(otherKey))) {
          continue;
        }
        const existing = await db.getDfArticleLookup(otherKey);
        // Attributed to the video it is being filed against, so the stored
        // article says which of its embeds this record is about.
        const attributed: DfArticleRef = { ...ref, youtubeVideoId: videoId };

        if (!isCompanionPiece) {
          const base: DfArticleLookupState = existing ?? {
            contentKey: otherKey,
            relatedArticles: [],
            lastAttemptedAt: new Date(0),
            missCount: 0,
          };
          const updated = DfArticleUtils.withRelated(base, [attributed]);
          if (updated.relatedArticles.length === base.relatedArticles.length) {
            continue;
          }
          await db.setDfArticleLookup(updated);
          logger.log("debug", `Filed related article for ${otherKey} seen while searching for ${searchedFor}: ${ref.url}`);
          continue;
        }

        if (existing?.article) {
          continue;
        }
        await db.setDfArticleLookup({
          contentKey: otherKey,
          article: { ...attributed, text: text! },
          relatedArticles: existing?.relatedArticles ?? [],
          lastAttemptedAt: new Date(),
          missCount: 0,
        });
        logger.log("info", `Filed article for ${otherKey} found while searching for ${searchedFor}: ${ref.url}`);
      } catch (e) {
        // A byproduct is a bonus - failing to file one must not fail the
        // lookup that was actually asked for.
        logger.log("warn", `Could not file byproduct article for ${otherKey}: ${e}`);
      }
    }
  }
};

const recordMiss = async (
  db: DfDownloaderOperationalDb,
  contentKey: string,
  existing: DfArticleLookupState | undefined,
  reason: string,
  related: DfArticleRef[]
) => {
  await db.setDfArticleLookup(
    DfArticleUtils.withRelated(
      {
        contentKey,
        relatedArticles: existing?.relatedArticles ?? [],
        lastAttemptedAt: new Date(),
        missCount: (existing?.missCount ?? 0) + 1,
        lastError: reason,
      },
      related
    )
  );
};
