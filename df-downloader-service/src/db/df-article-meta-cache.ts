import { logger, zodParse } from "df-downloader-common";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ensureDirectory, writeFileAtomic } from "../utils/file-utils.js";

/**
 * What is known about an article page, without having to fetch it again.
 *
 * The expensive question this feature keeps asking is "which videos does
 * this page embed?", and the only way to answer it is to fetch and parse
 * the page. That answer is then thrown away, so the same round-ups get
 * re-fetched over and over: once per retry for as long as a companion
 * article stays unwritten, again whenever a similarly-titled video is
 * searched for, and again on every backfill run. The pages that score
 * highest are exactly the ones several videos will nominate.
 *
 * Caching the answer turns almost all of that into a lookup. Notably it is
 * enough on its own for the two cases that dominate:
 *
 * - "this page is not about the video I am looking for" - answered without
 *   a request, which is the majority outcome of every search.
 * - filing a page as related reading, which needs a title and a link and
 *   never needs the body.
 *
 * Only a positive companion-article match still costs a fetch, to get the
 * text an analysis will be grounded on. That happens once per piece of
 * content, ever.
 *
 * The body is deliberately not cached. It is by far the largest field, it
 * is already stored per-content wherever it is actually used, and keeping
 * a second copy of every article ever fetched would cost far more disk
 * than the requests it saves are worth.
 */

const CACHE_FILENAME = "article-meta-cache.json";
const CURRENT_VERSION = "1";

/**
 * A ceiling, not an expectation. Realistically this holds a few thousand
 * entries; the cap exists so that a pathological run cannot grow the file
 * without bound. Eviction is oldest-first and costs only a re-fetch.
 */
const MAX_ENTRIES = 20000;

/**
 * How long writes are batched for.
 *
 * A scan reads up to 25 articles in a row and a backfill run many more, so
 * writing the whole file per entry would rewrite it hundreds of times for
 * one logical operation. Losing a couple of seconds of this cache on a
 * crash costs a re-fetch, never data - the same trade the article index
 * already makes.
 */
const FLUSH_DEBOUNCE_MS = 2000;

const DfArticleMeta = z.object({
  slug: z.string(),
  title: z.string(),
  author: z.string().optional(),
  /**
   * Whether this entry was written by a version that reads authors at all.
   *
   * Author parsing arrived after this cache did, and the entry schema had no
   * author field before it - so zod stripped the parsed name on the way in
   * and every entry cached before then has none. That makes "no author" the
   * exact signature of a stale read rather than of an article without a
   * byline, and this flag is what stops the two being confused: an entry
   * re-read and still found to have no author is stamped, so it settles
   * instead of being fetched again on every pass.
   */
  authorRead: z.boolean().optional(),
  /** Every YouTube video the page embeds, in document order. The whole point. */
  videoIds: z.array(z.string()),
  /** The sitemap's last-modified stamp when read, so an edited page can be re-read. */
  lastmod: z.coerce.date().optional(),
  cachedAt: z.coerce.date(),
});
export type DfArticleMeta = z.infer<typeof DfArticleMeta>;

const DfArticleMetaCacheFile = z.object({
  version: z.string(),
  entries: z.record(z.string(), DfArticleMeta),
});
type DfArticleMetaCacheFile = z.infer<typeof DfArticleMetaCacheFile>;

export class DfArticleMetaCache {
  private dirty = false;
  private flushTimer: NodeJS.Timeout | undefined;

  private constructor(
    private readonly filePath: string,
    private cache: DfArticleMetaCacheFile
  ) {}

  static async create(dbDir: string): Promise<DfArticleMetaCache> {
    ensureDirectory(dbDir);
    const filePath = path.join(dbDir, CACHE_FILENAME);
    let cache: DfArticleMetaCacheFile = { version: CURRENT_VERSION, entries: {} };
    try {
      cache = zodParse(DfArticleMetaCacheFile, JSON.parse(await fs.promises.readFile(filePath, { encoding: "utf-8" })));
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        // Starting empty is always safe here - every entry is recoverable
        // by fetching the page again, which is exactly what this avoids
        // rather than what it enables.
        logger.log("warn", `Article metadata cache unreadable, starting empty: ${e}`);
      }
    }
    const toReread = Object.values(cache.entries).filter((entry) => !entry.author && !entry.authorRead).length;
    if (toReread) {
      logger.log(
        "info",
        `${toReread} cached ${toReread === 1 ? "article" : "articles"} predate author parsing and will be read once more as the scan reaches them`
      );
    }
    return new DfArticleMetaCache(filePath, cache);
  }

  get(url: string): DfArticleMeta | undefined {
    return this.cache.entries[url];
  }

  /**
   * Whether a cached read is still good for a sitemap entry.
   *
   * A page whose last-modified stamp has moved since it was read may have
   * gained or lost an embed, so the cached embed list can no longer be
   * trusted. Without a stamp on either side there is nothing to compare,
   * and the cached answer stands.
   */
  isFresh(url: string, lastmod?: Date): boolean {
    const entry = this.cache.entries[url];
    if (!entry) {
      return false;
    }
    // Cached before authors were stored, so it is worth one more read - see
    // authorRead. Only ever once per entry, whatever that read turns up.
    if (!entry.author && !entry.authorRead) {
      return false;
    }
    if (!lastmod || !entry.lastmod) {
      return true;
    }
    return entry.lastmod.getTime() >= lastmod.getTime();
  }

  /**
   * Every article this installation has seen, newest first.
   *
   * The cache exists to answer "does this page embed that video" without a
   * fetch, but it incidentally accumulates a record of the articles the app
   * has encountered - everything the periodic scan has read plus every
   * candidate weighed during a search. That is not Digital Foundry's whole
   * archive and should not be presented as one, but it is a real list of
   * what is known, which is enough to browse.
   */
  list(): (DfArticleMeta & { url: string })[] {
    return Object.entries(this.cache.entries)
      .map(([url, meta]) => ({ ...meta, url }))
      .sort((a, b) => {
        const aTime = (a.lastmod ?? a.cachedAt).getTime();
        const bTime = (b.lastmod ?? b.cachedAt).getTime();
        return bTime - aTime;
      });
  }

  set(url: string, meta: DfArticleMeta): void {
    // Stamped here rather than at each call site, so a new caller cannot
    // accidentally write an entry that looks like a pre-author one.
    this.cache.entries[url] = { ...meta, authorRead: true };
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, FLUSH_DEBOUNCE_MS);
    // Never hold the process open for a cache write.
    this.flushTimer.unref?.();
  }

  async flush(): Promise<void> {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.evictIfOversized();
    try {
      await writeFileAtomic(this.filePath, JSON.stringify(this.cache));
    } catch (e) {
      logger.log("warn", `Could not write article metadata cache: ${e}`);
    }
  }

  private evictIfOversized() {
    const urls = Object.keys(this.cache.entries);
    if (urls.length <= MAX_ENTRIES) {
      return;
    }
    const oldestFirst = urls.sort(
      (a, b) => this.cache.entries[a].cachedAt.getTime() - this.cache.entries[b].cachedAt.getTime()
    );
    for (const url of oldestFirst.slice(0, urls.length - MAX_ENTRIES)) {
      delete this.cache.entries[url];
    }
    logger.log("debug", `Article metadata cache trimmed to ${MAX_ENTRIES} entries`);
  }
}
