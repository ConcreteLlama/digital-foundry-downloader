import { BulkBackfillTarget, DfContentEntryUtils, logger } from "df-downloader-common";
import { AiAnalysisConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";
import { BatchOperationTaskBuilder } from "../task-manager/task/batch-operation-task-builder.js";
import { ensureArticleForContent } from "../utils/df-articles/ensure-article.js";

/**
 * One bulk backfill run: apply subtitles, AI analysis or article matching
 * across a set of library items.
 *
 * Built on BatchOperationTaskBuilder, the same primitive behind
 * BatchMoveFilesTask, so a run is one task with aggregate progress that
 * can be paused and cancelled - rather than a client loop firing the
 * single-item endpoint N times, which would report N independent
 * progresses and sail straight past the concurrency limits each of these
 * operations has for its own reasons.
 *
 * The per-item work is deliberately delegated to the existing single-item
 * paths rather than reimplemented. Each item's real pipeline is started
 * and awaited, so it shows up in Activity like any other, obeys its own
 * task manager's concurrency, and cannot drift from the behaviour of the
 * single-item action it is supposed to be a bulk version of.
 */

export type BulkBackfillTaskOpts = {
  target: BulkBackfillTarget;
  force: boolean;
  language: string;
  db: DfDownloaderOperationalDb;
  aiAnalysisConfig?: AiAnalysisConfig;
  /**
   * Supplied rather than imported to avoid a cycle - DfTaskManager owns
   * this task, so this task cannot import it.
   */
  runSubtitles: (contentKey: string) => Promise<string>;
  runAnalysis: (contentKey: string) => Promise<string>;
};

export type BulkBackfillItem = { contentKey: string };

/** What happened to one item, for the run's summary. */
export type BulkBackfillOutcome = "done" | "skipped" | "not_applicable";

/**
 * Whether this item still needs the work, checked now rather than when the
 * job was queued.
 *
 * This is the server-side safety net. The client computes the same thing
 * to drive its "select all applicable" button, but that snapshot ages: a
 * run over a few hundred items takes long enough that an item can gain
 * subtitles, or be analysed, from an unrelated action while it waits its
 * turn. Re-checking here means the worst case is a skip rather than
 * redoing paid or expensive work on the strength of a stale list.
 */
const stillNeedsWork = async (
  contentKey: string,
  opts: BulkBackfillTaskOpts
): Promise<{ needed: boolean; reason?: string }> => {
  const entry = await opts.db.getContentEntry(contentKey);
  if (!entry) {
    return { needed: false, reason: "no longer in the library" };
  }

  switch (opts.target) {
    case "subtitles": {
      if (!DfContentEntryUtils.hasDownload(entry)) {
        return { needed: false, reason: "nothing downloaded" };
      }
      if (!opts.force && DfContentEntryUtils.hasSubtitles(entry, opts.language)) {
        return { needed: false, reason: "already has subtitles" };
      }
      return { needed: true };
    }
    case "ai_analysis": {
      if (!DfContentEntryUtils.hasDownload(entry)) {
        return { needed: false, reason: "nothing downloaded" };
      }
      if (!opts.force && opts.db.getAiAnalysisIndexEntry(contentKey)) {
        return { needed: false, reason: "already analysed" };
      }
      return { needed: true };
    }
    case "df_article": {
      if (!entry.contentInfo.youtubeVideoId) {
        // Without a video ID a candidate cannot be verified, and an
        // unverified article is worse than none - see article-lookup.ts.
        return { needed: false, reason: "no YouTube video to verify a match against" };
      }
      if (!opts.force) {
        const existing = await opts.db.getDfArticleLookup(contentKey);
        if (existing?.article) {
          return { needed: false, reason: "already matched" };
        }
      }
      return { needed: true };
    }
  }
};

export const BulkBackfillTask = BatchOperationTaskBuilder(
  async (item: BulkBackfillItem, opts: BulkBackfillTaskOpts): Promise<BulkBackfillOutcome> => {
    const { needed, reason } = await stillNeedsWork(item.contentKey, opts);
    if (!needed) {
      logger.log("debug", `Bulk backfill skipping ${item.contentKey}: ${reason}`);
      return "skipped";
    }

    switch (opts.target) {
      case "subtitles":
        await opts.runSubtitles(item.contentKey);
        return "done";
      case "ai_analysis":
        await opts.runAnalysis(item.contentKey);
        return "done";
      case "df_article": {
        const entry = await opts.db.getContentEntry(item.contentKey);
        if (!entry) {
          return "not_applicable";
        }
        // Background priority: a bulk sweep must never push ahead of
        // something the user is waiting on in the UI. The shared request
        // queue handles the spacing.
        const article = await ensureArticleForContent(opts.db, entry.contentInfo, { force: opts.force });
        // A miss is a legitimate outcome, not a failure - the article may
        // simply not be written yet, and the lookup records that so a
        // later run tries again.
        return article ? "done" : "skipped";
      }
    }
  },
  {
    taskType: "bulk_backfill",
    idPrefix: "bulk-backfill",
  }
);
export type BulkBackfillTask = ReturnType<typeof BulkBackfillTask>;

export const isBulkBackfillTask = (task: any): task is BulkBackfillTask => task.taskType === "bulk_backfill";

/**
 * How many items of a target run at once.
 *
 * Each is a ceiling on top of the limit the underlying work already has,
 * not a replacement for it - subtitle generation has its own configurable
 * maxConcurrent because local transcription saturates the CPU, and every
 * Digital Foundry request goes through the shared spacing queue whatever
 * happens here.
 */
export const BULK_BACKFILL_CONCURRENCY: Record<BulkBackfillTarget, number> = {
  // Transcription is CPU-bound and its own manager serialises it anyway;
  // queueing more here just builds a backlog that cannot be cancelled as
  // cleanly.
  subtitles: 1,
  // Matches the analysis task manager's own default - the work is a remote
  // API call, so a couple in flight costs this machine nothing.
  ai_analysis: 2,
  // Almost entirely spent waiting on the rate-limited request queue, so a
  // little more parallelism here shortens the run without increasing the
  // rate anything actually reaches Digital Foundry.
  df_article: 3,
};
