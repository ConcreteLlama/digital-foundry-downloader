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
export const DfArticle = z.object({
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
  /** Article body as plain text, including any rendered tables. */
  text: z.string(),
  author: z.string().optional(),
  matchedAt: z.coerce.date(),
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
  /** Present only when an article was found and verified. */
  article: DfArticle.optional(),
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
  /** When the next attempt becomes due, for showing "checked recently" in the UI. */
  nextRetryAt: (state: DfArticleLookupState): Date | undefined => {
    if (state.article) {
      return undefined;
    }
    const backoffIndex = Math.min(state.missCount, ARTICLE_RETRY_BACKOFF_MS.length - 1);
    return new Date(state.lastAttemptedAt.getTime() + ARTICLE_RETRY_BACKOFF_MS[backoffIndex]);
  },
};
