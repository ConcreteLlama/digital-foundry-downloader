import { DfArticleLookupState, logger, zodParse } from "df-downloader-common";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ensureDirectory } from "../utils/file-utils.js";

/**
 * Storage for Digital Foundry article lookups.
 *
 * Split the same way analysis results are, and for the same reason: an
 * article's text runs to several kilobytes, and this can in principle
 * cover the whole library, so it does not belong in a DB file that is
 * rewritten in full every time a download completes.
 *
 * The index here carries slightly different information from the analysis
 * one, because the interesting question is different. For analysis it is
 * "has this been analysed". For articles it is "when may this be looked
 * at again" - so the index holds the attempt bookkeeping (last attempt,
 * consecutive misses) rather than a result summary, and can answer
 * "should I search now?" without touching the disk.
 */

const INDEX_FILENAME = "index.json";
const ARTICLE_DIR = "df-articles";
const CURRENT_VERSION = "1.0.0";

/**
 * The per-item index entry.
 *
 * Deliberately holds everything `DfArticleUtils.shouldRetry` needs, so the
 * retry decision - which is made on every content-panel open - never costs
 * a file read.
 */
const DfArticleIndexEntry = z.object({
  lastAttemptedAt: z.coerce.date(),
  missCount: z.number().int().default(0),
  hasArticle: z.boolean().default(false),
  url: z.string().optional(),
  title: z.string().optional(),
});
type DfArticleIndexEntry = z.infer<typeof DfArticleIndexEntry>;

const DfArticleIndexFile = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  entries: z.record(z.string(), DfArticleIndexEntry),
});
type DfArticleIndexFile = z.infer<typeof DfArticleIndexFile>;

const keyToFilename = (key: string): string => {
  const safe = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `${safe}-${hash}.json`;
};

export class DfArticleStore {
  private constructor(private readonly dir: string, private index: DfArticleIndexFile) {}

  static async create(dbDir: string): Promise<DfArticleStore> {
    const dir = path.join(dbDir, ARTICLE_DIR);
    ensureDirectory(dir);
    let index: DfArticleIndexFile = { version: CURRENT_VERSION, lastUpdated: new Date(), entries: {} };
    try {
      const raw = await fs.promises.readFile(path.join(dir, INDEX_FILENAME), { encoding: "utf-8" });
      index = zodParse(DfArticleIndexFile, JSON.parse(raw));
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        // Losing this index costs re-searching, not data: every entry is
        // rebuilt by the next lookup. Starting empty is therefore safe,
        // and much simpler than reconstructing it from result files.
        logger.log("warn", `Article index unreadable, starting empty: ${e}`);
      }
    }
    return new DfArticleStore(dir, index);
  }

  private async writeIndex(): Promise<void> {
    this.index.lastUpdated = new Date();
    const indexPath = path.join(this.dir, INDEX_FILENAME);
    const tempPath = `${indexPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(this.index, null, 2), { encoding: "utf-8" });
    await fs.promises.rename(tempPath, indexPath);
  }

  async set(state: DfArticleLookupState): Promise<void> {
    const filePath = path.join(this.dir, keyToFilename(state.contentKey));
    const tempPath = `${filePath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(state, null, 2), { encoding: "utf-8" });
    await fs.promises.rename(tempPath, filePath);
    this.index.entries[state.contentKey] = {
      lastAttemptedAt: state.lastAttemptedAt,
      missCount: state.missCount,
      hasArticle: Boolean(state.article),
      url: state.article?.url,
      title: state.article?.title,
    };
    await this.writeIndex();
  }

  async get(contentKey: string): Promise<DfArticleLookupState | undefined> {
    if (!this.index.entries[contentKey]) {
      return undefined;
    }
    try {
      const raw = await fs.promises.readFile(path.join(this.dir, keyToFilename(contentKey)), { encoding: "utf-8" });
      return zodParse(DfArticleLookupState, JSON.parse(raw));
    } catch (e) {
      logger.log("warn", `Could not read article state for ${contentKey}: ${e}`);
      return undefined;
    }
  }

  /**
   * The attempt bookkeeping alone, without reading the article text.
   *
   * This is what the retry check uses. Synchronous and in-memory so that
   * deciding "is a search due?" costs nothing on a path that runs whenever
   * a content panel opens.
   */
  getIndexEntry(contentKey: string): DfArticleIndexEntry | undefined {
    return this.index.entries[contentKey];
  }

  getAllIndexEntries(): Record<string, DfArticleIndexEntry> {
    return this.index.entries;
  }
}
