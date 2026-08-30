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
   * How much history a *first* run considers, going forwards.
   *
   * Small on purpose: a fresh install has an empty cursor, and without this
   * the first tick would treat the site's entire back catalogue as new and
   * fetch it in one go.
   *
   * Older articles are not abandoned, they are just approached differently -
   * see archiveWalkEnabled, which works backwards a capped batch at a time
   * instead of all at once.
   */
  initialLookbackDays: z
    .number()
    .min(0)
    .default(7)
    .describe(
      "On a brand-new install, how far back the first check looks. Kept short so setting the app up does not trigger a long crawl - older articles are picked up gradually instead, see below."
    ),
  /**
   * Whether to work backwards through the archive as well as forwards.
   *
   * The forward scan only ever looks at what is newer than its watermark, so
   * without this an install only gets articles for content published after it
   * was set up. Everything older needed someone to go and press the backfill
   * tool, which in practice nobody does.
   *
   * Deliberately a slow trickle rather than a crawl: one index and at most
   * maxArticlesPerScan articles per check, resuming exactly where it stopped,
   * so a decade of archive is read over days of ordinary running rather than
   * in one sitting. It stops on its own once it reaches the far end.
   */
  /**
   * The walk's own budget, separate from the forward scan's.
   *
   * Sharing the forward scan's numbers made this uselessly slow: 25 articles
   * on a twelve-hour tick is 50 a day, and the 2026 index alone held 377
   * unread - so a full archive would have taken months. The two jobs want
   * different pacing because they are different sizes. Forward is a handful
   * a day forever; backwards is a large finite pile that should be got
   * through and then stop.
   *
   * Requests are paced by the shared queue regardless (5-15s apart, and
   * anything you do yourself jumps ahead of it), so this bounds how much
   * work each tick queues rather than how fast it is allowed to go.
   */
  archiveWalkPerRun: z
    .number()
    .min(1)
    .default(100)
    .describe(
      "The most older articles to read per pass. Requests are spaced out regardless, and anything you do yourself takes priority, so this decides how long the catch-up takes overall rather than how hard it hits the site."
    ),
  archiveWalkInterval: z
    .number()
    .min(60000)
    .default(3600000)
    .describe("How often to do a pass through older articles, while there are still any left to read."),
  archiveWalkEnabled: z
    .boolean()
    .default(true)
    .describe(
      "Work backwards through older Digital Foundry articles a batch at a time, so content you already have gains its written companion without running the Backfill tool. Uses the same per-check limit above, so it is a trickle rather than a crawl, and stops once it has been through everything."
    ),
});
export type DfArticlesConfig = z.infer<typeof DfArticlesConfig>;
export const DfArticlesConfigKey = "dfArticles";
