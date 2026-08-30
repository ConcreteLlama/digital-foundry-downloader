import { DfArticle, DfArticleLookupState, DfArticleRef, DfArticleUtils, logger } from "df-downloader-common";
import { DfArticlesConfig } from "df-downloader-common/config/df-articles-config.js";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";
import { DfFetchPriority, dfFetch } from "../../df-request-queue.js";
import { SitemapEntry, fetchSitemap } from "./article-lookup.js";
import { parseArticlePage } from "./article-parser.js";

/**
 * The periodic sweep for newly published Digital Foundry articles.
 *
 * This runs in the opposite direction to `ensureArticleForContent`, and
 * that inversion is the entire reason it can run on a timer.
 *
 * Searching per video means scoring the site index against one title and
 * fetching two or three candidate pages to check which video each embeds -
 * around one and a bit requests per item, measured. Applied to a library of
 * a few thousand, that is hours of queued requests, which is exactly why
 * the backfill tool quotes a duration before it starts.
 *
 * Reading new articles instead costs one request per article, and Digital
 * Foundry publish a few a day. Each article states which videos it embeds,
 * so the match falls out of the read rather than being searched for. Steady
 * state is therefore a couple of requests per run: the year's sitemap,
 * usually served from cache, plus whatever is genuinely new.
 *
 * Two protections against that steady state being wrong. The cursor only
 * advances over articles actually read, so a capped run resumes rather than
 * skipping; and on a fresh install, with no cursor at all, the window is a
 * few days rather than the site's entire history - going backwards through
 * that is what the backfill tool is for, where the cost is stated and the
 * choice is explicit.
 */

/**
 * How the scan reports itself, for logging and the status indicator.
 */
export type ArticleScanResult = {
  articlesRead: number;
  primaryMatches: number;
  relatedMatches: number;
  /** True when the per-run cap stopped it short, so more remain. */
  capped: boolean;
};

/**
 * Sitemaps to consider, given where the cursor sits.
 *
 * Almost always just the current year. The previous one is included when
 * the cursor still points into it, which matters for exactly one case: the
 * first run after New Year, where everything published in late December
 * would otherwise be stepped over silently.
 */
const yearsToScan = (cursor: Date, now: Date): number[] => {
  const years = new Set<number>([now.getUTCFullYear(), cursor.getUTCFullYear()]);
  return [...years].sort();
};

export const scanForNewArticles = async (
  db: DfDownloaderOperationalDb,
  config: DfArticlesConfig,
  now: Date = new Date()
): Promise<ArticleScanResult> => {
  const result: ArticleScanResult = { articlesRead: 0, primaryMatches: 0, relatedMatches: 0, capped: false };

  const storedCursor = db.getDfArticleScanCursor();
  const cursor =
    storedCursor ?? new Date(now.getTime() - config.initialLookbackDays * 24 * 60 * 60 * 1000);
  if (!storedCursor) {
    logger.log(
      "info",
      `First article scan - looking back ${config.initialLookbackDays} days only. Use Tools → Backfill to match older content.`
    );
  }

  const entries: SitemapEntry[] = [];
  for (const year of yearsToScan(cursor, now)) {
    try {
      entries.push(...(await fetchSitemap(year, DfFetchPriority.BACKGROUND)));
    } catch (e) {
      // One unreadable sitemap is not a reason to abandon the run, and it
      // must not advance the cursor past articles that were never read.
      logger.log("warn", `Article scan could not read the ${year} index: ${e}`);
    }
  }

  const fresh = entries
    .filter((entry): entry is SitemapEntry & { lastmod: Date } => Boolean(entry.lastmod))
    .filter((entry) => entry.lastmod.getTime() > cursor.getTime())
    // Oldest first, so that stopping at the cap leaves a cursor that is
    // still a true watermark - everything before it has been read.
    .sort((a, b) => a.lastmod.getTime() - b.lastmod.getTime());

  if (!fresh.length) {
    // Still advance: nothing new means the site has been read up to now,
    // and leaving the cursor behind would re-examine the same window.
    await db.setDfArticleScanCursor(now);
    return result;
  }

  const toRead = fresh.slice(0, config.maxArticlesPerScan);
  result.capped = fresh.length > toRead.length;
  if (result.capped) {
    logger.log(
      "info",
      `Article scan found ${fresh.length} new articles, reading ${toRead.length} this time - the rest follow on the next check.`
    );
  }

  let watermark = cursor;
  for (const entry of toRead) {
    // Already read at this revision. Its lastmod moved for some reason
    // other than a change we care about - or it was read by a lookup
    // before the scan reached it - so there is nothing to pay for.
    if (db.isDfArticleMetaFresh(entry.url, entry.lastmod)) {
      watermark = entry.lastmod;
      continue;
    }
    const article = await readArticle(entry);
    // Only advance over articles that were actually read. A page that
    // could not be fetched stays ahead of the cursor and is retried.
    if (!article) {
      continue;
    }
    result.articlesRead++;
    watermark = entry.lastmod;
    db.setDfArticleMeta(entry.url, {
      slug: entry.slug,
      title: article.article.title,
      author: article.article.author,
      videoIds: article.videoIds,
      lastmod: entry.lastmod,
      cachedAt: new Date(),
    });
    const filed = await fileAgainstLibrary(db, article.article, article.videoIds);
    result.primaryMatches += filed.primary;
    result.relatedMatches += filed.related;
  }

  await db.setDfArticleScanCursor(watermark);
  if (result.primaryMatches || result.relatedMatches) {
    logger.log(
      "info",
      `Article scan read ${result.articlesRead} new article${result.articlesRead === 1 ? "" : "s"}: ` +
        `${result.primaryMatches} matched to content, ${result.relatedMatches} filed as related.`
    );
  }
  return result;
};

const readArticle = async (
  entry: SitemapEntry
): Promise<{ article: DfArticle; videoIds: string[] } | undefined> => {
  try {
    const response = await dfFetch(
      entry.url,
      {},
      { priority: DfFetchPriority.BACKGROUND, label: `Article scan: ${entry.slug.slice(0, 40)}` }
    );
    if (!response.ok) {
      return undefined;
    }
    const parsed = parseArticlePage(await response.text());
    // No embed means nothing to attach it to. Not a failure - plenty of
    // Digital Foundry's writing is not about a video at all.
    if (!parsed?.text.trim() || !parsed.youtubeVideoIds.length) {
      return undefined;
    }
    return {
      videoIds: parsed.youtubeVideoIds,
      article: {
        url: entry.url,
        slug: entry.slug,
        title: parsed.title,
        youtubeVideoId: parsed.youtubeVideoIds[0],
        text: parsed.text,
        author: parsed.author,
        matchedAt: new Date(),
      },
    };
  } catch (e) {
    logger.log("warn", `Article scan could not read ${entry.url}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
};

/**
 * Attaches one already-read article to whatever it belongs to.
 *
 * Same rule as every other path files by, for the same reason: a page
 * embedding one video is that video's companion piece, a page embedding
 * several is a round-up related to all of them. Nothing here fetches
 * anything, and nothing is created for content that is not in the library.
 */
const fileAgainstLibrary = async (
  db: DfDownloaderOperationalDb,
  article: DfArticle,
  videoIds: string[]
): Promise<{ primary: number; related: number }> => {
  const counts = { primary: 0, related: 0 };
  const isCompanionPiece = videoIds.length === 1;

  for (const videoId of videoIds) {
    const contentKey = `yt-${videoId}`;
    try {
      if (!(await db.getContentEntry(contentKey))) {
        continue;
      }
      const existing = await db.getDfArticleLookup(contentKey);
      // Related entries never carry the body - see DfArticleLookupState.
      const { text, ...ref } = article;
      const attributed: DfArticleRef = { ...ref, youtubeVideoId: videoId };

      if (!isCompanionPiece) {
        const base: DfArticleLookupState = existing ?? {
          contentKey,
          relatedArticles: [],
          lastAttemptedAt: new Date(0),
          missCount: 0,
        };
        const updated = DfArticleUtils.withRelated(base, [attributed]);
        if (updated.relatedArticles.length === base.relatedArticles.length) {
          continue;
        }
        await db.setDfArticleLookup(updated);
        counts.related++;
        continue;
      }

      if (existing?.article) {
        continue;
      }
      await db.setDfArticleLookup({
        contentKey,
        article: { ...attributed, text },
        relatedArticles: existing?.relatedArticles ?? [],
        lastAttemptedAt: new Date(),
        missCount: 0,
      });
      counts.primary++;
      logger.log("info", `Article scan matched ${contentKey} to ${article.url}`);
    } catch (e) {
      logger.log("warn", `Article scan could not file ${article.url} against ${contentKey}: ${e}`);
    }
  }
  return counts;
};

/**
 * Where the backward walk gives up rather than probing ever-older years.
 *
 * Digital Foundry's writing does not predate this, and a year with no index
 * costs a request to discover, so there has to be a bottom.
 */
const ARCHIVE_WALK_FLOOR_YEAR = 2004;

/**
 * How many empty years one run will step past.
 *
 * An empty index is cheap - the fetch caches the empty result - but it is
 * still a request, so a run walks past a couple and leaves the rest for the
 * next tick rather than sprinting through a decade of nothing.
 */
const MAX_EMPTY_YEARS_PER_RUN = 2;

/**
 * Works backwards through the archive, a capped batch at a time.
 *
 * The forward scan only ever looks at what is newer than its watermark, so
 * on its own an install only gains articles for content published after it
 * was set up. Everything older waited for someone to go and press the
 * backfill tool, which in practice nobody does.
 *
 * Paced by its own budget rather than the forward scan's, because the two
 * jobs are different sizes: forward is a handful a day forever, backwards is
 * a large finite pile that should be got through and then stop. Sharing the
 * scan's numbers made it uselessly slow - a full archive would have taken
 * months. One index and at most `archiveWalkPerRun` articles per run,
 * resuming exactly where it stopped, and stopping for good at the far end.
 *
 * Requests are spaced by the shared queue regardless, and anything the user
 * does takes priority over this, so the budget decides how long the catch-up
 * takes rather than how hard it hits the site.
 *
 * Position is a year because the indexes are per-year, so it is both the
 * resume point and the next thing to ask for. The year only advances once
 * everything in it has been read - an article that failed to fetch stays
 * unread and is retried, rather than being stepped over.
 */
export const walkArticleArchive = async (
  db: DfDownloaderOperationalDb,
  config: DfArticlesConfig,
  now: Date = new Date()
): Promise<ArticleScanResult> => {
  const result: ArticleScanResult = { articlesRead: 0, primaryMatches: 0, relatedMatches: 0, capped: false };

  const state = db.getDfArticleArchiveWalkState();
  if (state.complete) {
    return result;
  }

  let year = state.year ?? now.getUTCFullYear();
  let emptyYears = 0;

  for (;;) {
    if (year < ARCHIVE_WALK_FLOOR_YEAR) {
      logger.log("info", `Article archive walk finished - nothing older than ${ARCHIVE_WALK_FLOOR_YEAR} to read`);
      await db.setDfArticleArchiveWalkState({ complete: true });
      return result;
    }

    let entries: SitemapEntry[];
    try {
      entries = await fetchSitemap(year, DfFetchPriority.BACKGROUND);
    } catch (e) {
      // Stay put rather than stepping past a year that was never read.
      logger.log("warn", `Article archive walk could not read the ${year} index: ${e}`);
      await db.setDfArticleArchiveWalkState({ year });
      return result;
    }

    const unread = entries
      .filter((entry): entry is SitemapEntry & { lastmod: Date } => Boolean(entry.lastmod))
      .filter((entry) => !db.isDfArticleMetaFresh(entry.url, entry.lastmod))
      // Newest first within the year, so the most likely to matter to a
      // recent library are read first.
      .sort((a, b) => b.lastmod.getTime() - a.lastmod.getTime());

    if (!unread.length) {
      if (!entries.length) {
        emptyYears++;
      }
      year -= 1;
      if (emptyYears >= MAX_EMPTY_YEARS_PER_RUN) {
        await db.setDfArticleArchiveWalkState({ year });
        return result;
      }
      continue;
    }

    // The walk's own budget, not the forward scan's - see archiveWalkPerRun.
    const toRead = unread.slice(0, config.archiveWalkPerRun);
    result.capped = unread.length > toRead.length;
    logger.log(
      "info",
      `Article archive walk reading ${toRead.length} of ${unread.length} remaining from ${year}`
    );

    for (const entry of toRead) {
      const article = await readArticle(entry);
      if (!article) {
        continue;
      }
      result.articlesRead++;
      db.setDfArticleMeta(entry.url, {
        slug: entry.slug,
        title: article.article.title,
        author: article.article.author,
        videoIds: article.videoIds,
        lastmod: entry.lastmod,
        cachedAt: new Date(),
      });
      const filed = await fileAgainstLibrary(db, article.article, article.videoIds);
      result.primaryMatches += filed.primary;
      result.relatedMatches += filed.related;
    }

    // Stay on this year. Anything read is fresh next time, so `unread`
    // shrinks; the year advances only when it empties, which is also what
    // gives a failed fetch another go.
    await db.setDfArticleArchiveWalkState({ year });
    return result;
  }
};
