import {
  AiAnalysisIndexEntry,
  AiAnalysisResult,
  logger,
  makeAiAnalysisIndexEntry,
  zodParse,
} from "df-downloader-common";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { ensureDirectory, writeFileAtomic } from "../utils/file-utils.js";

/**
 * Storage for AI analysis results: one JSON file per content item, plus a
 * small index.
 *
 * ## Why not the main DB
 *
 * A single analysis is around 8KB - a detailed summary, a conclusion, a
 * settings table and a set of tags. Tagging deliberately works from title
 * and description alone, so it applies to the *whole* library rather than
 * only downloaded items, which puts full coverage at roughly 23MB.
 *
 * Both existing content DBs are `FileDb`s, and `FileDb` rewrites the
 * entire file on every single update. `content-status-db.json` is
 * currently ~700KB and is touched by every download, availability change
 * and archive scan - dropping 23MB of analysis into it would mean
 * rewriting 23MB on each of those, for data none of them touch. This
 * codebase already demonstrates where that road ends:
 * `completed-pipelines.json` has reached several hundred megabytes.
 *
 * One file per item means writing an analysis costs one small write, and
 * nothing else in the system gets slower as coverage grows.
 *
 * ## Why there is also an index
 *
 * The cost of splitting is that "has this been analysed?" would otherwise
 * need a directory full of reads to answer - and the content list asks it
 * for every row. The index answers that from memory: a few hundred bytes
 * per entry, loaded once at startup, rewritten only when an analysis is
 * written. Full results are read from disk only when an item is actually
 * opened.
 *
 * The index is a derived cache, never the source of truth. If it is lost
 * or corrupt it is rebuilt from the result files themselves rather than
 * treated as an error - the results are what matter.
 */

const INDEX_FILENAME = "index.json";
const ANALYSIS_DIR = "ai-analysis";

const AiAnalysisIndexFile = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  entries: z.record(z.string(), AiAnalysisIndexEntry),
});
type AiAnalysisIndexFile = z.infer<typeof AiAnalysisIndexFile>;

/**
 * Bumped whenever a field is added that existing index files cannot have.
 *
 * 1.1.0 added acceptedTags, which the metadata staleness check needs: without
 * it every analysed item compares against the wrong tags and reads as
 * permanently out of date.
 */
const CURRENT_VERSION = "1.3.0";

/**
 * Schema version of an individual result file.
 *
 * Separate from the index's version because the two answer different
 * questions. The index is a derived cache that can be rebuilt from the
 * results at any time; the result files are the source of truth, and are
 * the only thing a patch can usefully be applied to. Versioning only the
 * index - which is what this store did originally - meant a change to the
 * stored shape had to be detected by inspecting values, which is guesswork
 * and gets less reliable with every subsequent change.
 *
 * Files written before this existed carry no version and are treated as
 * 1.0.0.
 */
const RESULT_SCHEMA_VERSION = "1.2.0";
const UNVERSIONED_RESULT_SCHEMA = "1.0.0";

/**
 * Brings one stored result file up to the current schema.
 *
 * A version chain in the same shape as the FileDb patch routines: each step
 * moves one version forward, so adding a future change means appending a
 * branch rather than revisiting this one. Operates on raw parsed JSON and
 * never on a zod-validated object, because the whole point is that the file
 * does not validate yet.
 *
 * An unrecognised version - a file written by a newer build - is left
 * untouched rather than guessed at. Downgrading is not supported, but
 * silently mangling the file would be worse than failing to read it.
 */
/**
 * Each step's renames, as they were at the time.
 *
 * Deliberately not `AiContentTypeRenames`, which flattens every historical
 * name onto its *current* one. That flat map is right for asking "what is
 * this old name now", and wrong inside a version chain: a 1.0.0 file run
 * through it would land on the final name in one hop, skipping the
 * intermediate state that the next step needs to recognise - which is exactly
 * how the `verdict` field move below would lose track of which payloads it
 * applies to.
 */
const V1_1_RENAMES: Record<string, string> = {
  console_comparison: "platform_comparison",
  platform_analysis: "single_platform_analysis",
};

const V1_2_RENAMES: Record<string, string> = {
  platform_comparison: "platform_tech_review",
  single_platform_analysis: "platform_tech_review",
  game_retrospective: "platform_tech_review",
};

/** Applies a rename to both places the content type is recorded. */
const renameContentType = (result: any, renames: Record<string, string>) => {
  if (!result) {
    return;
  }
  const renamed = renames[result.contentType];
  if (renamed) {
    result.contentType = renamed;
  }
  const structuredRenamed = result.structuredData ? renames[result.structuredData.contentType] : undefined;
  if (structuredRenamed) {
    result.structuredData.contentType = structuredRenamed;
  }
};

const patchResultFile = (stored: any): { stored: any; patched: boolean } => {
  let version: string = stored?.schemaVersion || UNVERSIONED_RESULT_SCHEMA;
  let patched = false;

  while (version !== RESULT_SCHEMA_VERSION) {
    if (version === UNVERSIONED_RESULT_SCHEMA) {
      // 1.0.0 -> 1.1.0: console_comparison became platform_comparison and
      // platform_analysis became single_platform_analysis. The type is
      // recorded in two places and both have to move together, or the
      // discriminated union stops matching the result's own content type.
      renameContentType(stored?.result, V1_1_RENAMES);
      version = "1.1.0";
      patched = true;
    } else if (version === "1.1.0") {
      /*
       * 1.1.0 -> 1.2.0: platform_comparison and single_platform_analysis were
       * one type wearing two labels, and game_retrospective was mostly port
       * analyses wearing a third. All three become platform_tech_review.
       *
       * The payloads also named the same claim differently - `verdict` on the
       * single-platform type, `recommendation` on the other - so the survivor
       * takes `recommendation` and the old field is moved into it. That has to
       * be decided from the type the file had BEFORE the rename, which is why
       * it is read first: afterwards every one of them says platform_tech_review
       * and there is no way to tell which payloads carried a verdict.
       */
      const structured = stored?.result?.structuredData;
      const wasSinglePlatform = structured?.contentType === "single_platform_analysis";
      renameContentType(stored?.result, V1_2_RENAMES);
      if (wasSinglePlatform && structured) {
        // Only ever set when the old field was present, so a payload that
        // genuinely had neither stays absent rather than gaining a null.
        if (structured.verdict !== undefined) {
          structured.recommendation = structured.verdict;
        }
        delete structured.verdict;
      }
      version = "1.2.0";
      patched = true;
    } else {
      logger.log("warn", `Analysis result file is at unknown schema version ${version}, leaving it alone`);
      return { stored, patched: false };
    }
  }

  stored.schemaVersion = version;
  return { stored, patched };
};

/**
 * A filesystem-safe name for a content key.
 *
 * Most keys are already safe ("yt-aNohHBSJWHw"), but keys carried over
 * from the pre-relaunch site are article slugs and manual entries are
 * user-influenced, so neither can be trusted into a path. The short hash
 * suffix is what makes the mapping injective: sanitising alone would map
 * "a/b" and "a_b" onto the same file, and silently serving one item's
 * analysis for another is a far worse failure than an ugly filename.
 */
const keyToFilename = (key: string): string => {
  const safe = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 8);
  return `${safe}-${hash}.json`;
};

export class AiAnalysisStore {
  private index: AiAnalysisIndexFile;
  /**
   * Every stored result, held once a cross-content view has asked for them.
   *
   * Aggregate views (the game index) need the full results, which the
   * per-item split deliberately keeps off the startup path. Reading the
   * whole directory is a few hundred small files at most - tens of
   * milliseconds - and is only paid when such a view is actually opened,
   * so it is cached rather than made cheap.
   *
   * Invalidated on every write, which is sound precisely because `set` and
   * `remove` are the only two paths that change anything.
   */
  private allResultsCache: { contentKey: string; result: AiAnalysisResult }[] | undefined;

  private constructor(private readonly dir: string, index: AiAnalysisIndexFile) {
    this.index = index;
  }

  static async create(dbDir: string): Promise<AiAnalysisStore> {
    const dir = path.join(dbDir, ANALYSIS_DIR);
    ensureDirectory(dir);
    /*
     * Patching happens before the index is touched, and that ordering is
     * load-bearing. Every read path zod-parses the result, so a file still
     * holding a pre-rename content type does not merely look odd - it fails
     * validation, and both loadIndex and rebuildIndex treat a failure as an
     * unreadable file and skip it. The analysis would be silently absent
     * while sitting intact on disk.
     */
    const onDiskVersion = await AiAnalysisStore.readIndexVersion(dir);
    const stale = onDiskVersion !== CURRENT_VERSION;
    if (stale) {
      await AiAnalysisStore.migrateResultFiles(dir);
    }
    const index = await AiAnalysisStore.loadIndex(dir, onDiskVersion);
    const store = new AiAnalysisStore(dir, index);
    /*
     * A rebuilt index has to be written back, or it is rebuilt again on the
     * next startup and forever after: rebuildIndex only ever returned it in
     * memory, and writeIndex is otherwise reached only by set() and
     * remove(). Left alone, the version gate above would never advance and
     * every start would re-scan the whole directory.
     */
    if (stale) {
      await store.writeIndex();
    }
    return store;
  }

  /**
   * The index's version, read without validating anything else.
   *
   * Deliberately not zodParse: this is the gate that decides whether a
   * migration is needed, so it has to work in exactly the case where the
   * rest of the file no longer validates. Missing or unreadable reports
   * undefined, which runs the migration - a no-op on a fresh install.
   */
  private static async readIndexVersion(dir: string): Promise<string | undefined> {
    try {
      const raw = await fs.promises.readFile(path.join(dir, INDEX_FILENAME), { encoding: "utf-8" });
      return (JSON.parse(raw) as { version?: string })?.version;
    } catch {
      return undefined;
    }
  }

  /**
   * Applies the result-file patch chain across the whole directory.
   *
   * Runs once per version bump rather than on every startup, and rewrites
   * only the files a patch actually changed. A file that cannot be read or
   * written is logged and skipped rather than aborting the run: one bad
   * file should cost one analysis, not the entire store.
   */
  private static async migrateResultFiles(dir: string): Promise<void> {
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(dir);
    } catch {
      return;
    }
    let migrated = 0;
    for (const file of files) {
      if (file === INDEX_FILENAME || !file.endsWith(".json")) {
        continue;
      }
      const filePath = path.join(dir, file);
      try {
        const stored = JSON.parse(await fs.promises.readFile(filePath, { encoding: "utf-8" }));
        const { stored: patchedFile, patched } = patchResultFile(stored);
        if (!patched) {
          continue;
        }
        await writeFileAtomic(filePath, JSON.stringify(patchedFile, null, 2));
        migrated++;
      } catch (e) {
        logger.log("warn", `Could not patch analysis file ${file}: ${e}`);
      }
    }
    if (migrated > 0) {
      logger.log("info", `Patched ${migrated} AI analysis result files to schema ${RESULT_SCHEMA_VERSION}`);
    }
  }

  private static async loadIndex(dir: string, knownVersion?: string): Promise<AiAnalysisIndexFile> {
    const indexPath = path.join(dir, INDEX_FILENAME);
    try {
      /*
       * The version is checked before validating, not after. An index from an
       * older build can legitimately fail the current schema - that is what a
       * version bump means - and parsing first reported an ordinary upgrade as
       * corruption, burying the real signal under a wall of validation errors.
       */
      if (knownVersion !== undefined && knownVersion !== CURRENT_VERSION) {
        logger.log("info", `AI analysis index is version ${knownVersion}, rebuilding for ${CURRENT_VERSION}`);
        return AiAnalysisStore.rebuildIndex(dir);
      }
      const raw = await fs.promises.readFile(indexPath, { encoding: "utf-8" });
      const parsed = zodParse(AiAnalysisIndexFile, JSON.parse(raw));
      /*
       * The version was recorded but never checked, so an index written by an
       * older build was loaded as-is and any field added since was silently
       * absent - present in the schema, defaulted, and wrong. Rebuilding is
       * cheap relative to being quietly incorrect, and only happens once.
       */
      if (parsed.version !== CURRENT_VERSION) {
        logger.log("info", `AI analysis index is version ${parsed.version}, rebuilding for ${CURRENT_VERSION}`);
        return AiAnalysisStore.rebuildIndex(dir);
      }
      return parsed;
    } catch (e) {
      // Missing is the normal first-run case and not worth a warning.
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        logger.log("warn", `AI analysis index unreadable, rebuilding from result files: ${e}`);
        return AiAnalysisStore.rebuildIndex(dir);
      }
      return { version: CURRENT_VERSION, lastUpdated: new Date(), entries: {} };
    }
  }

  /**
   * Reconstructs the index by reading every result file.
   *
   * Only reached when the index is missing or unparseable. Slow in
   * proportion to how much has been analysed, but it runs once and the
   * alternative - treating a damaged cache as lost data - would throw away
   * results that are sitting intact on disk.
   */
  private static async rebuildIndex(dir: string): Promise<AiAnalysisIndexFile> {
    const entries: Record<string, AiAnalysisIndexEntry> = {};
    let files: string[] = [];
    try {
      files = await fs.promises.readdir(dir);
    } catch {
      return { version: CURRENT_VERSION, lastUpdated: new Date(), entries };
    }
    for (const file of files) {
      if (file === INDEX_FILENAME || !file.endsWith(".json")) {
        continue;
      }
      try {
        const raw = await fs.promises.readFile(path.join(dir, file), { encoding: "utf-8" });
        const stored = JSON.parse(raw) as { contentKey?: string; result?: unknown };
        if (!stored.contentKey || !stored.result) {
          continue;
        }
        const result = zodParse(AiAnalysisResult, stored.result);
        entries[stored.contentKey] = makeAiAnalysisIndexEntry(result);
      } catch (e) {
        logger.log("warn", `Skipping unreadable analysis file ${file}: ${e}`);
      }
    }
    logger.log("info", `Rebuilt AI analysis index from ${Object.keys(entries).length} result files`);
    return { version: CURRENT_VERSION, lastUpdated: new Date(), entries };
  }

  private async writeIndex(): Promise<void> {
    this.index.lastUpdated = new Date();
    const indexPath = path.join(this.dir, INDEX_FILENAME);
    await writeFileAtomic(indexPath, JSON.stringify(this.index, null, 2));
  }

  async set(contentKey: string, result: AiAnalysisResult): Promise<void> {
    const filePath = path.join(this.dir, keyToFilename(contentKey));
    // The key is stored inside the file as well as encoded in its name, so
    // a rebuild can recover the mapping without having to reverse the
    // hash - which it cannot do.
    const payload = { schemaVersion: RESULT_SCHEMA_VERSION, contentKey, result };
    await writeFileAtomic(filePath, JSON.stringify(payload, null, 2));
    this.index.entries[contentKey] = makeAiAnalysisIndexEntry(result);
    this.allResultsCache = undefined;
    await this.writeIndex();
  }

  async get(contentKey: string): Promise<AiAnalysisResult | undefined> {
    // The index is authoritative on existence, so an un-analysed item
    // costs a map lookup rather than a failed file open. With a content
    // list that asks per row, that difference matters.
    if (!this.index.entries[contentKey]) {
      return undefined;
    }
    try {
      const raw = await fs.promises.readFile(path.join(this.dir, keyToFilename(contentKey)), { encoding: "utf-8" });
      const stored = JSON.parse(raw) as { result?: unknown };
      return stored.result ? zodParse(AiAnalysisResult, stored.result) : undefined;
    } catch (e) {
      logger.log("warn", `Could not read analysis for ${contentKey}: ${e}`);
      return undefined;
    }
  }

  async remove(contentKey: string): Promise<void> {
    delete this.index.entries[contentKey];
    this.allResultsCache = undefined;
    await fs.promises.rm(path.join(this.dir, keyToFilename(contentKey)), { force: true });
    await this.writeIndex();
  }

  /**
   * Every stored result, for the cross-content views.
   *
   * Driven from the index rather than a directory listing, so a result
   * file left behind by a removed entry is ignored rather than
   * resurrected.
   */
  async getAllResults(): Promise<{ contentKey: string; result: AiAnalysisResult }[]> {
    if (this.allResultsCache) {
      return this.allResultsCache;
    }
    const results: { contentKey: string; result: AiAnalysisResult }[] = [];
    for (const contentKey of Object.keys(this.index.entries)) {
      const result = await this.get(contentKey);
      if (result) {
        results.push({ contentKey, result });
      }
    }
    this.allResultsCache = results;
    return results;
  }

  /** Synchronous and in-memory - safe to call per row while rendering a list. */
  getIndexEntry(contentKey: string): AiAnalysisIndexEntry | undefined {
    return this.index.entries[contentKey];
  }

  getAllIndexEntries(): Record<string, AiAnalysisIndexEntry> {
    return this.index.entries;
  }

  has(contentKey: string): boolean {
    return Boolean(this.index.entries[contentKey]);
  }
}
