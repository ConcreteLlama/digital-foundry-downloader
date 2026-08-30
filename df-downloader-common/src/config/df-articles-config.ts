import { z } from "zod";

/**
 * Settings for finding Digital Foundry's written articles.
 *
 * Matching an article to a video is otherwise entirely lazy - it happens
 * when a person asks for it, or when an analysis is about to need the text.
 * That is deliberate and stays that way; this section governs the one
 * background job, which works in the opposite direction.
 *
 * The direction is the whole reason it is affordable. Searching *per video*
 * means scoring the site's index for that title and fetching a couple of
 * candidate pages, so sweeping a library costs roughly one and a bit
 * requests per item - thousands of requests, and hours of queued time, for
 * a library this size. Walking *newly published articles* instead costs one
 * request per article, and Digital Foundry publish a few a day. Every
 * article read that way announces which videos it embeds, so it can be
 * filed against whatever is already in the library for free.
 *
 * That inversion is why this can run on a timer at all, and why the
 * bulk backfill tool still exists for going backwards through history.
 */
export const DfArticlesConfig = z.object({
  scanEnabled: z
    .boolean()
    .default(true)
    .describe(
      "Periodically check Digital Foundry's newly published articles and attach them to matching videos in your library. Cheap by design - it reads each new article once, rather than searching the site for every video you own."
    ),
  /**
   * Long by default. Nothing is waiting on this: an article that appears
   * an hour after its video is equally useful found half a day later, and
   * anything the scan misses is still findable on demand from the content
   * panel or the backfill tool.
   */
  scanInterval: z
    .number()
    .min(60 * 60 * 1000)
    .default(12 * 60 * 60 * 1000)
    .describe(
      "How often to look for newly published articles. Digital Foundry publish a few a day at most, so checking more often finds the same articles slightly sooner at the cost of more traffic."
    ),
  /**
   * A ceiling on a single run, not a target. Steady state is a handful;
   * this exists so that an unusual day - or a batch of old articles
   * republished with fresh timestamps - cannot turn one tick into hundreds
   * of requests.
   */
  maxArticlesPerScan: z
    .number()
    .min(1)
    .default(25)
    .describe(
      "The most articles a single check will read. A safety limit rather than a goal - anything beyond it is picked up by the next check."
    ),
  /**
   * How much history a *first* run considers.
   *
   * Small on purpose. A fresh install has an empty cursor, and without
   * this the first tick would treat the site's entire back catalogue as
   * new. Going backwards through history is what the backfill tool is
   * for, where it is an explicit choice with a stated cost, rather than
   * something that happens quietly on first boot.
   */
  initialLookbackDays: z
    .number()
    .min(0)
    .default(7)
    .describe(
      "On a brand-new install, how far back the first check looks. Kept short so setting the app up does not trigger a long crawl - use Tools → Backfill to go through older content deliberately."
    ),
});
export type DfArticlesConfig = z.infer<typeof DfArticlesConfig>;
export const DfArticlesConfigKey = "dfArticles";
