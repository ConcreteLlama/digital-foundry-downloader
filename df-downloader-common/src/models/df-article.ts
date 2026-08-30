import { z } from "zod";

/**
 * A Digital Foundry written article matched to a piece of video content.
 *
 * DF often publish a written companion piece for review-style videos,
 * authored by a writer rather than the presenter. For the content types
 * this project extracts structured data from, that article is a strictly
 * better source than the video's audio: it is human-written and
 * human-checked, its terminology and product names are correct by
 * construction (nothing was ever transcribed), and for PC reviews it
 * frequently contains the settings table outright rather than as prose to
 * be reconstructed.
 */
/**
 * An article identified and attributed to a video, without its body.
 *
 * Everything needed to name it, link to it and prove the match. The text
 * is deliberately not part of this: it is by far the largest field, and
 * only one consumer - grounding an analysis - ever reads it.
 */
export const DfArticleRef = z.object({
  /** Absolute URL of the article. */
  url: z.string(),
  slug: z.string(),
  title: z.string(),
  /**
   * The YouTube video ID embedded in the article, which is what proves the
   * match. A title search only ever produces a *candidate*; this is the
   * evidence that the candidate is about the same video.
   */
  youtubeVideoId: z.string(),
  author: z.string().optional(),
  matchedAt: z.coerce.date(),
});
export type DfArticleRef = z.infer<typeof DfArticleRef>;

export const DfArticle = DfArticleRef.extend({
  /** Article body as plain text, including any rendered tables. */
  text: z.string(),
});
export type DfArticle = z.infer<typeof DfArticle>;

/**
 * The record of looking for an article, whether or not one was found.
 *
 * The distinction this type exists to preserve: **a miss is "not yet", not
 * "never"**. Patreon content is frequently early access, so a video can be
 * downloaded days or weeks before its companion article is published - if
 * one is ever published at all. Recording a miss as final would silently
 * lose every match that would have succeeded on a later attempt, and the
 * failure would be invisible: the content would simply never gain an
 * article, and nothing would indicate that it might have.
 *
 * This is the substantive difference from the YouTube description/duration
 * backfill this is otherwise modelled on. There, a miss genuinely does
 * mean the data is not available. Here it usually means the article has
 * not been written yet.
 */
export const DfArticleLookupState = z.object({
  contentKey: z.string(),
  /**
   * The companion piece: an article written about this video and this
   * video alone. Present only when one was found and verified.
   */
  article: DfArticle.optional(),
  /**
   * Other articles that embed this video without being about it.
   *
   * A round-up, a "week in tech" or a follow-up piece may carry several
   * videos at once. Those are worth surfacing - they are genuinely
   * related reading - but they are not the companion article, and they
   * make poor grounding for analysis, because most of their text is
   * about something else.
   *
   * These accumulate incidentally. Nothing searches for them; they turn
   * up while verifying candidates for this video or for another one, and
   * are kept because the page had already been fetched.
   *
   * Stored without their text, because nothing reads it. They exist to be
   * listed and linked, never to ground an analysis - and a round-up filed
   * against five videos would otherwise store five copies of a body that
   * is mostly about the other four.
   */
  relatedArticles: z.array(DfArticleRef).default([]),
  /** When a lookup was last attempted, successful or not. Drives the retry cadence. */
  lastAttemptedAt: z.coerce.date(),
  /**
   * Consecutive failed attempts. Used only to space retries further apart
   * over time - it is never compared against a limit, because there is no
   * attempt count at which "this article does not exist yet" stops being a
   * plausible explanation.
   */
  missCount: z.number().int().default(0),
  /** Last failure reason, for display. Not an error state - most content has no article. */
  lastError: z.string().optional(),
});
export type DfArticleLookupState = z.infer<typeof DfArticleLookupState>;

/**
 * How long to wait before looking again after a miss.
 *
 * Backs off so that repeatedly opening a content panel does not re-search
 * the site each time, but caps rather than growing without bound: an
 * article published six months after its video should still be found, and
 * an ever-doubling delay would eventually mean never.
 *
 * The cap is deliberately shorter than "give up" because there is no give
 * up - see DfArticleLookupState.
 */
export const ARTICLE_RETRY_BACKOFF_MS = [
  6 * 60 * 60 * 1000, // 6 hours
  24 * 60 * 60 * 1000, // 1 day
  3 * 24 * 60 * 60 * 1000, // 3 days
  7 * 24 * 60 * 60 * 1000, // 1 week
];

export const DfArticleUtils = {
  /**
   * Whether a fresh lookup is worth making.
   *
   * A found article is never re-searched: the video-ID check that verified
   * it cannot become less true, so there is nothing a second search could
   * improve.
   */
  shouldRetry: (state: DfArticleLookupState | undefined, now: number = Date.now()): boolean => {
    if (!state) {
      return true;
    }
    if (state.article) {
      return false;
    }
    const backoffIndex = Math.min(state.missCount, ARTICLE_RETRY_BACKOFF_MS.length - 1);
    return now - state.lastAttemptedAt.getTime() >= ARTICLE_RETRY_BACKOFF_MS[backoffIndex];
  },
  /**
   * Folds newly-seen related articles into a lookup state.
   *
   * Deduplicated by URL, and never allowed to shadow the primary: the
   * same page can be encountered repeatedly - once per retry, and again
   * whenever it turns up while verifying some other video - and each
   * encounter would otherwise add another copy.
   */
  withRelated: (state: DfArticleLookupState, articles: DfArticleRef[]): DfArticleLookupState => {
    if (!articles.length) {
      return state;
    }
    const byUrl = new Map(state.relatedArticles.map((article) => [article.url, article]));
    for (const article of articles) {
      if (article.url === state.article?.url) {
        continue;
      }
      byUrl.set(article.url, article);
    }
    return { ...state, relatedArticles: [...byUrl.values()] };
  },
  /**
   * Whether this candidate has already been fetched and classified.
   *
   * Stops a retry paying for a page it has already seen and decided is
   * not the companion piece - which, without this, happened on every
   * single retry for as long as the real article stayed unwritten.
   */
  alreadySeen: (state: DfArticleLookupState | undefined, url: string): boolean =>
    Boolean(state?.relatedArticles.some((article) => article.url === url)),
  /** When the next attempt becomes due, for showing "checked recently" in the UI. */
  nextRetryAt: (state: DfArticleLookupState): Date | undefined => {
    if (state.article) {
      return undefined;
    }
    const backoffIndex = Math.min(state.missCount, ARTICLE_RETRY_BACKOFF_MS.length - 1);
    return new Date(state.lastAttemptedAt.getTime() + ARTICLE_RETRY_BACKOFF_MS[backoffIndex]);
  },
};


/**
 * A video an article embeds, resolved against the library.
 *
 * An article records the YouTube ids it embeds; this is that id matched up
 * with the content this app knows about, so a listing can link to it. An
 * embedded video the library has never seen simply does not appear here -
 * Digital Foundry publish plenty that predates or falls outside what has
 * been scanned.
 */
export const DfArticleLinkedVideo = z.object({
  contentKey: z.string(),
  title: z.string(),
  youtubeVideoId: z.string(),
  /** Whether the file is on disk, so the listing can offer to open it. */
  downloaded: z.boolean(),
});
export type DfArticleLinkedVideo = z.infer<typeof DfArticleLinkedVideo>;

/**
 * One row of the article listing.
 *
 * Built from the metadata cache rather than a fetch: everything here was
 * already read and kept while matching articles to videos, so browsing the
 * list costs Digital Foundry nothing.
 */
export const DfArticleListingItem = z.object({
  url: z.string(),
  slug: z.string(),
  title: z.string(),
  author: z.string().optional(),
  lastmod: z.coerce.date().optional(),
  cachedAt: z.coerce.date(),
  /** Every embedded video id, including ones with no match in the library. */
  videoIds: z.array(z.string()),
  linkedVideos: z.array(DfArticleLinkedVideo),
});
export type DfArticleListingItem = z.infer<typeof DfArticleListingItem>;

export const DfArticleListingResponse = z.object({
  articles: z.array(DfArticleListingItem),
});
export type DfArticleListingResponse = z.infer<typeof DfArticleListingResponse>;
