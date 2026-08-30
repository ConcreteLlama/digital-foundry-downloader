import { DfArticle, DfArticleRef, DfContentInfo, logger } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";
import { DfFetchPriority, dfFetch } from "../../df-request-queue.js";
import { parseArticlePage } from "./article-parser.js";

/**
 * Finding the Digital Foundry article that accompanies a video.
 *
 * ## What does not work, and why
 *
 * Searching for the video ID does not work: it appears only inside an
 * iframe `src` attribute, so nothing indexes it as text. Searching DF's
 * own site search does not work either - `/search` is a Google Custom
 * Search widget rendered entirely client-side, and the served HTML
 * contains no results at all. Walking the `/features` listing pages does
 * work, but only for the last few days of articles; content downloaded
 * from Patreon early access is routinely weeks older than the listing's
 * first pages, and the article for it sits far beyond them.
 *
 * ## What is used instead
 *
 * The site publishes year-partitioned article sitemaps
 * (`/sitemap.articles.<year>.xml`, advertised in robots.txt). Each is a
 * plain list of every article URL for that year with its publication date
 * - a few hundred entries, well under 100KB. That gives complete archive
 * coverage for one cacheable request, rather than partial coverage for
 * several.
 *
 * Matching then runs on two independent signals, neither of which is
 * trusted alone:
 *
 * 1. **Title overlap** against the slug, which nominates candidates.
 * 2. **Publication date proximity**, which disambiguates them. This
 *    matters more than it sounds: DF publish several articles about one
 *    game - a review, a preview, a PC piece, a console face-off - whose
 *    slugs all share the game's name and therefore score almost
 *    identically on title alone. The companion article to a given video
 *    appears near it in time, so date closeness separates them where the
 *    words cannot.
 * 3. **The embedded video ID**, which is the actual proof. The first two
 *    only decide what is worth fetching; this decides what is correct.
 *
 * ## When several articles embed the same video
 *
 * Only one is kept, and it is the best-scoring one rather than whichever
 * arrived first: candidates are sorted by title overlap and then date
 * proximity before any are fetched, and the search stops at the first
 * confirmed match, so "first" and "best" are the same candidate. That is
 * a deliberate simplification rather than an oversight - a video's
 * companion piece is the article about it, and a second page that merely
 * embeds the same video (a news post, a weekly roundup) is not a better
 * source for it. Storing every page that references a video would grow
 * the grounding text with material about other things, which is the
 * opposite of what the grounding is for.
 *
 * The inverse case - one article embedding several videos - is handled in
 * verifyCandidate, and matters more, because getting it wrong attaches an
 * article to content it only mentions.
 *
 * ## Request economy
 *
 * Digital Foundry are a small team and their robots.txt asks for a
 * five-second crawl delay. Every request here goes through `dfFetch`, so
 * it inherits the shared queue's spacing and backoff. Sitemaps are cached
 * in memory for hours - they are exactly the kind of static index that is
 * meant to be fetched once - so the steady-state cost of a lookup is one
 * or two article fetches, and often zero when the answer is already known.
 */

const DF_BASE_URL = "https://www.digitalfoundry.net";

/**
 * How long a fetched sitemap stays usable.
 *
 * Long, deliberately. A sitemap is a static index; re-fetching it often
 * buys nothing, because a genuinely new article is picked up by the
 * caller's own retry backoff (hours to days) rather than by this cache
 * being fresh to the minute.
 */
const SITEMAP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Candidates actually fetched and checked, best-scoring first. */
const MAX_CANDIDATES_TO_VERIFY = 3;

/** Minimum title overlap before a candidate is worth spending a request on. */
const MIN_TITLE_SCORE = 0.3;

/**
 * How far from the video's own date an article may sit and still be
 * considered its companion.
 *
 * Generous in both directions: DF's written piece can precede the video
 * (a review published alongside an embargo) or follow it by a week or
 * two, and Patreon early access widens the gap further. Wide enough not
 * to lose real matches, narrow enough to separate this year's game from
 * the same game's coverage a year later.
 */
const MAX_DATE_DISTANCE_DAYS = 120;

export type SitemapEntry = { url: string; slug: string; section: string; lastmod?: Date };
type CachedSitemap = { entries: SitemapEntry[]; fetchedAt: number };
const sitemapCache = new Map<number, CachedSitemap>();

/**
 * Words carried by so many DF titles that matching on them is noise -
 * nearly every video is a "review" or "analysis" of something.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "is", "are", "was", "were",
  "it", "its", "this", "that", "we", "our", "you", "your", "df", "digital", "foundry",
  "review", "analysis", "tech", "test", "video", "vs", "versus", "first", "look", "hands",
  "new", "best", "how", "why", "what", "more", "than", "not", "all", "can", "has", "have", "its",
]);

const tokenise = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  );

/**
 * Overlap between a video title and an article slug.
 *
 * Containment rather than Jaccard: the two are written independently and
 * are rarely similar in length. Jaccard would punish that length
 * difference for no reason; what matters is how much of the shorter one's
 * substance appears in the other.
 */
const titleScore = (videoTitle: string, slugWords: string): number => {
  const videoTokens = tokenise(videoTitle);
  const articleTokens = tokenise(slugWords);
  if (!videoTokens.size || !articleTokens.size) {
    return 0;
  }
  let shared = 0;
  for (const token of videoTokens) {
    if (articleTokens.has(token)) {
      shared++;
    }
  }
  return shared / Math.min(videoTokens.size, articleTokens.size);
};

const parseSitemap = (xml: string): SitemapEntry[] => {
  const entries: SitemapEntry[] = [];
  const urlBlocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) {
      continue;
    }
    const pathMatch = loc.match(/digitalfoundry\.net\/([^/]+)\/(.+)$/);
    if (!pathMatch) {
      continue;
    }
    const lastmodRaw = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
    const lastmod = lastmodRaw ? new Date(lastmodRaw) : undefined;
    entries.push({
      url: loc,
      section: pathMatch[1],
      slug: pathMatch[2],
      lastmod: lastmod && !isNaN(lastmod.getTime()) ? lastmod : undefined,
    });
  }
  return entries;
};

export const fetchSitemap = async (year: number, priority?: number): Promise<SitemapEntry[]> => {
  const cached = sitemapCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < SITEMAP_CACHE_TTL_MS) {
    return cached.entries;
  }
  const response = await dfFetch(
    `${DF_BASE_URL}/sitemap.articles.${year}.xml`,
    {},
    { priority: priority ?? DfFetchPriority.BACKGROUND, label: `Article index ${year}` }
  );
  if (!response.ok) {
    // A year with no sitemap is normal at the edges of the range - cache
    // the empty result so a missing year is not re-requested per lookup.
    if (response.status === 404) {
      sitemapCache.set(year, { entries: [], fetchedAt: Date.now() });
      return [];
    }
    throw new Error(`Could not read the ${year} article index (HTTP ${response.status})`);
  }
  const entries = parseSitemap(await response.text());
  sitemapCache.set(year, { entries, fetchedAt: Date.now() });
  logger.log("debug", `Loaded ${entries.length} article URLs from the ${year} sitemap`);
  return entries;
};

/**
 * Which years' indexes to search.
 *
 * The video's own year, plus the next one - an article for something
 * published in late December can land in January, and the year boundary
 * is not meaningful to anything except the sitemap's filename.
 */
const yearsToSearch = (publishedDate: Date): number[] => {
  const year = publishedDate.getFullYear();
  const currentYear = new Date().getFullYear();
  const years = [year, year + 1].filter((candidate) => candidate <= currentYear);
  return years.length ? years : [currentYear];
};

/**
 * An article that was fetched and positively identified as belonging to a
 * *different* video than the one being searched for.
 *
 * Worth returning rather than discarding: the page has already been paid
 * for, and it carries a definitive answer ("this article belongs to video
 * X") for whatever content that is. Rejected candidates are also not a
 * random sample - the title-and-date scoring means they are usually
 * another video about the same game, which is exactly the population most
 * likely to be in the library too.
 */
export type ArticleByproduct = {
  ref: DfArticleRef;
  /** Every video the page embeds - which decides what it can be filed as. */
  videoIds: string[];
  /**
   * Present only when the page was actually fetched this time.
   *
   * A cached page can still be filed as related reading, which needs
   * nothing but the ref. It cannot be filed as another video's companion
   * piece, because that stores the body an analysis is grounded on - but
   * that filing already happened the first time it was fetched.
   */
  text?: string;
};

export type ArticleLookupOutcome = (
  | { status: "found"; article: DfArticle }
  | { status: "not_found"; reason: string }
) & {
  /** Confirmed matches for other content, collected for free along the way. */
  byproducts: ArticleByproduct[];
  /**
   * Pages that embed the video being searched for without being about it.
   *
   * Returned on a miss as well as a match: they are worth keeping either
   * way, and on a miss they also record that these particular candidates
   * have been checked, so the next retry does not pay to fetch them again.
   */
  related: DfArticleRef[];
};

/**
 * Looks for the article accompanying one piece of content.
 *
 * Returns "not found" rather than throwing for the ordinary case, which is
 * genuinely common: plenty of DF videos never get a companion article, and
 * one that will get an article often has not got it yet. The caller records
 * that as a retryable miss, never as a settled answer.
 */
export const findArticleForContent = async (
  contentInfo: DfContentInfo,
  opts: { priority?: number; seenUrls?: Set<string>; db?: DfDownloaderOperationalDb } = {}
): Promise<ArticleLookupOutcome> => {
  const { youtubeVideoId, title, publishedDate } = contentInfo;
  const byproducts: ArticleByproduct[] = [];
  const related: DfArticleRef[] = [];
  if (!youtubeVideoId) {
    // Without a video ID there is nothing to verify a candidate against,
    // and title similarity alone is not good enough to attach an article
    // to content - a wrong one would be read by the analysis as
    // authoritative, which is worse than having none.
    return { status: "not_found", reason: "No YouTube video ID for this content, so a match cannot be verified", byproducts, related };
  }

  const published = publishedDate instanceof Date ? publishedDate : new Date(publishedDate);
  const entries: SitemapEntry[] = [];
  for (const year of yearsToSearch(published)) {
    try {
      entries.push(...(await fetchSitemap(year, opts.priority)));
    } catch (e) {
      logger.log("warn", `Article index fetch failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!entries.length) {
    return { status: "not_found", reason: "Could not read Digital Foundry's article index", byproducts, related };
  }

  const publishedMs = published.getTime();
  const maxDistanceMs = MAX_DATE_DISTANCE_DAYS * 24 * 60 * 60 * 1000;

  const scored = entries
    .map((entry) => {
      const slugWords = entry.slug.replace(/-/g, " ");
      const score = titleScore(title, slugWords);
      const distanceMs = entry.lastmod ? Math.abs(entry.lastmod.getTime() - publishedMs) : Number.POSITIVE_INFINITY;
      return { ...entry, score, distanceMs };
    })
    .filter((entry) => entry.score >= MIN_TITLE_SCORE)
    // An article about the same game from a different year is a real and
    // common false positive, and the words alone cannot tell it apart.
    .filter((entry) => entry.distanceMs <= maxDistanceMs)
    .sort((a, b) => {
      // Title first, but treat near-identical scores as ties and let date
      // break them - which is exactly the several-articles-per-game case.
      if (Math.abs(a.score - b.score) > 0.05) {
        return b.score - a.score;
      }
      return a.distanceMs - b.distanceMs;
    });

  if (!scored.length) {
    return { status: "not_found", reason: "No article with a similar title published around the same time", byproducts, related };
  }

  // Pages already fetched and classified on a previous attempt are not
  // worth paying for again - without this, every retry for as long as the
  // companion article stayed unwritten re-fetched the same round-ups.
  const toVerify = scored.filter((candidate) => !opts.seenUrls?.has(candidate.url)).slice(0, MAX_CANDIDATES_TO_VERIFY);
  if (!toVerify.length) {
    return {
      status: "not_found",
      reason: "Every similarly-titled article has already been checked",
      byproducts,
      related,
    };
  }
  for (const candidate of toVerify) {
    const result = await verifyCandidate(candidate, youtubeVideoId, opts.db, opts.priority);
    if (result.kind === "unusable") {
      continue;
    }
    const isAboutOneVideo = result.videoIds.length === 1;
    if (result.kind === "match") {
      // Only reachable without text if the cache answered, and the cache
      // is only trusted for pages that cannot become the companion piece.
      if (isAboutOneVideo && !result.text) {
        continue;
      }
      // Embedding the video is not the same as being about it. A page
      // carrying one video is the companion piece; one carrying five is a
      // round-up that happens to include it, and using that as grounding
      // would feed an analysis mostly-irrelevant text as though it were
      // written about this video.
      if (isAboutOneVideo) {
        logger.log("info", `Matched article for ${contentInfo.key}: ${candidate.url}`);
        return { status: "found", article: { ...result.ref, text: result.text! }, byproducts, related };
      }
      logger.log(
        "debug",
        `${result.ref.slug} embeds ${contentInfo.key} among ${result.videoIds.length} videos - keeping as related, still looking`
      );
      related.push(result.ref);
      continue;
    }
    // Positively identified as belonging to some other video. Whether it
    // is that video's companion piece or merely related to it is the same
    // question, answered the same way, so the caller gets the embed list
    // and decides.
    byproducts.push({ ref: result.ref, videoIds: result.videoIds, text: result.text });
  }

  return {
    status: "not_found",
    reason: `Checked ${toVerify.length} similarly-titled article${toVerify.length === 1 ? "" : "s"}, none was written about this video`,
    byproducts,
    related,
  };
};

/**
 * Fetches a candidate and confirms it is about the same video.
 *
 * The title and date only nominate; this is the proof. Without it, another
 * article about the same game - which DF reliably publish several of -
 * would be accepted and then fed to the analysis as fact.
 */
type VerifyResult =
  | { kind: "match" | "other"; ref: DfArticleRef; videoIds: string[]; text?: string }
  | { kind: "unusable" };

/**
 * What a page embeds, from memory where possible and a fetch otherwise.
 *
 * The cache is consulted for every candidate but trusted for only two of
 * the three answers, and the distinction is deliberate:
 *
 * - "this page does not embed the video" and "it embeds it among several"
 *   are answered outright. Together those are the overwhelming majority of
 *   candidates, and both are fully served by an embed list and a title.
 * - "this page is about exactly this video" is re-fetched anyway, because
 *   that is the one case whose result stores the article body for an
 *   analysis to be grounded on, and the body is deliberately not cached.
 *   It happens once per piece of content, ever.
 *
 * A page whose sitemap stamp has moved since it was read is not trusted at
 * all - it may have gained or lost an embed.
 */
const verifyCandidate = async (
  candidate: SitemapEntry,
  youtubeVideoId: string,
  db?: DfDownloaderOperationalDb,
  priority?: number
): Promise<VerifyResult> => {
  const cached = db?.isDfArticleMetaFresh(candidate.url, candidate.lastmod)
    ? db.getDfArticleMeta(candidate.url)
    : undefined;
  if (cached) {
    const isOurs = cached.videoIds.includes(youtubeVideoId);
    if (!isOurs || cached.videoIds.length > 1) {
      logger.log("debug", `Article ${candidate.slug} answered from cache - no request needed`);
      return {
        kind: isOurs ? "match" : "other",
        videoIds: cached.videoIds,
        ref: {
          url: candidate.url,
          slug: cached.slug,
          title: cached.title,
          youtubeVideoId: isOurs ? youtubeVideoId : cached.videoIds[0],
          author: cached.author,
          matchedAt: new Date(),
        },
      };
    }
  }

  try {
    const response = await dfFetch(
      candidate.url,
      {},
      { priority: priority ?? DfFetchPriority.BACKGROUND, label: `Article check: ${candidate.slug.slice(0, 40)}` }
    );
    if (!response.ok) {
      return { kind: "unusable" };
    }
    const parsed = parseArticlePage(await response.text());
    if (!parsed?.text.trim() || !parsed.youtubeVideoIds.length) {
      return { kind: "unusable" };
    }
    db?.setDfArticleMeta(candidate.url, {
      slug: candidate.slug,
      title: parsed.title,
      author: parsed.author,
      videoIds: parsed.youtubeVideoIds,
      lastmod: candidate.lastmod,
      cachedAt: new Date(),
    });

    // Membership, not equality. An article can lead with a trailer before
    // the video it is actually about, and testing only the first embed
    // would reject it as belonging to something else.
    const isOurs = parsed.youtubeVideoIds.includes(youtubeVideoId);
    if (!isOurs) {
      logger.log(
        "debug",
        `Article ${candidate.slug} embeds ${parsed.youtubeVideoIds.join(", ")}, not ${youtubeVideoId}`
      );
    }
    return {
      kind: isOurs ? "match" : "other",
      videoIds: parsed.youtubeVideoIds,
      text: parsed.text,
      ref: {
        url: candidate.url,
        slug: candidate.slug,
        title: parsed.title,
        youtubeVideoId: isOurs ? youtubeVideoId : parsed.youtubeVideoIds[0],
        author: parsed.author,
        matchedAt: new Date(),
      },
    };
  } catch (e) {
    logger.log("warn", `Article candidate check failed: ${e instanceof Error ? e.message : String(e)}`);
    return { kind: "unusable" };
  }
};
