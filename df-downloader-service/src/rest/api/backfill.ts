import {
  BulkBackfillCandidate,
  BulkBackfillEstimate,
  BulkBackfillEstimateRequest,
  BulkBackfillRequest,
  BulkBackfillTarget,
  DfArticleUtils,
  DfContentEntry,
  DfContentEntryUtils,
  logger,
} from "df-downloader-common";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import express from "express";
import { configService } from "../../config/config.js";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { estimateAnalysisCost } from "../../utils/ai/analyse.js";
import { sendError, sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";

/** Falls back to English, matching the rest of the subtitle paths. */
const configuredLanguage = () => "en";

/**
 * How many items are priced properly to produce a bulk cost estimate.
 *
 * Each costs a token-counting round trip, so pricing every item of a
 * thousand-item run would be slow enough to be its own problem - and the
 * point of the estimate is to inform a decision quickly, not to be exact.
 */
const COST_SAMPLE_SIZE = 3;

/**
 * Article fetches per item, measured rather than guessed.
 *
 * An item only costs a fetch if some article clears both a title-overlap
 * and a publication-date test, and each item that does costs up to three.
 * Measured against a real year of this library: about 75% of items
 * produced at least one candidate, averaging ~1.7 fetches each.
 *
 * The measurement matters because the intuition was wrong. The original
 * plan assumed the date window would leave older content scoring nothing,
 * making a full sweep cheap; in practice videos and their articles are
 * contemporaneous, so the window excludes almost nothing and the hit rate
 * is high. A whole-library run is hours of queued requests, and the
 * estimate needs to say so rather than quietly understating it.
 */
const ARTICLE_FETCHES_PER_ITEM = 1.3;

/** Midpoint of the request queue's randomised 5-15s spacing. */
const AVERAGE_REQUEST_SPACING_SECONDS = 10;

/**
 * Whether an item is worth offering for a given target at all.
 *
 * Distinct from whether it *needs* the work: a fully-analysed item is
 * still offered, because the re-run toggle exists. This only filters out
 * items the target could never apply to - subtitles and analysis need a
 * downloaded file, and an article can only be verified against a YouTube
 * video ID.
 */
const isRelevant = (entry: DfContentEntry, target: BulkBackfillTarget): boolean => {
  switch (target) {
    case "subtitles":
    case "ai_analysis":
      return DfContentEntryUtils.hasDownload(entry);
    case "df_article":
      return Boolean(entry.contentInfo.youtubeVideoId);
  }
};

export const makeBackfillRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  /**
   * The items a target could act on, with what each already has.
   *
   * Scoped by target rather than returning the whole library with every
   * flag: for subtitles and analysis that is a handful of downloaded
   * items rather than thousands of rows the client would immediately
   * discard.
   */
  router.get("/candidates", async (req, res) => {
    try {
      const parsedTarget = BulkBackfillTarget.safeParse(req.query.target);
      if (!parsedTarget.success) {
        return sendError(res, `Unknown backfill target "${req.query.target}"`, 400);
      }
      const target = parsedTarget.data;
      const language = (req.query.language as string) || configuredLanguage();
      const entries = await contentManager.db.getAllContentEntries();

      const candidates: BulkBackfillCandidate[] = [];
      for (const entry of entries) {
        if (!isRelevant(entry, target)) {
          continue;
        }
        // Read from the in-memory index rather than loading each stored
        // analysis - the full results are one file per item and this runs
        // over the whole library.
        const analysisIndexEntry = contentManager.db.getAiAnalysisIndexEntry(entry.key);
        const articleIndexEntry = contentManager.db.getDfArticleIndexEntry(entry.key);
        candidates.push({
          contentKey: entry.key,
          title: entry.contentInfo.title,
          publishedDate: entry.contentInfo.publishedDate,
          hasDownload: DfContentEntryUtils.hasDownload(entry),
          hasSubtitles: DfContentEntryUtils.hasSubtitles(entry, language),
          hasAnalysis: Boolean(analysisIndexEntry),
          hasArticle: Boolean(articleIndexEntry?.hasArticle),
          articleLookupDue: articleIndexEntry?.hasArticle
            ? false
            : DfArticleUtils.shouldRetry(
                articleIndexEntry
                  ? {
                      contentKey: entry.key,
                      lastAttemptedAt: articleIndexEntry.lastAttemptedAt,
                      missCount: articleIndexEntry.missCount,
                    }
                  : undefined
              ),
        });
      }

      candidates.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());
      return sendResponse(res, { candidates, libraryCount: entries.length });
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * What a run will cost before it starts.
   *
   * Only AI analysis costs money; the others cost time and, for article
   * matching, requests against a site that asks for a crawl delay - which
   * is worth stating for the same reason, since it is the difference
   * between a run taking minutes and taking days.
   */
  router.post("/estimate", async (req, res) => {
    await zodParseHttp(BulkBackfillEstimateRequest, req, res, async ({ target, contentKeys, force }) => {
      try {
        const itemCount = contentKeys.length;
        if (target === "subtitles") {
          return sendResponse(res, {
            target,
            itemCount,
            sampledCount: 0,
            note: "Transcribing runs on this machine and costs nothing but CPU time. Long videos can take tens of minutes each, and they run one at a time.",
          } satisfies BulkBackfillEstimate);
        }
        if (target === "df_article") {
          const requests = Math.round(itemCount * ARTICLE_FETCHES_PER_ITEM);
          const hours = (requests * AVERAGE_REQUEST_SPACING_SECONDS) / 3600;
          const duration =
            hours >= 1 ? `${hours.toFixed(1)} hours` : `${Math.max(1, Math.round(hours * 60))} minutes`;
          return sendResponse(res, {
            target,
            itemCount,
            sampledCount: 0,
            estimatedDfRequests: requests,
            note: `No API cost, but this is slow by design: requests to Digital Foundry are deliberately spaced out, so expect around ${duration} of queued requests. It runs in the background and can be cancelled at any point - anything already matched is kept.`,
          } satisfies BulkBackfillEstimate);
        }

        const config = configService.config.aiAnalysis;
        if (!AiAnalysisConfigUtils.isUsable(config)) {
          return sendError(res, "AI analysis is not enabled, or no API key has been set", 400);
        }
        // Priced from a sample and scaled. Every item would mean one
        // token-counting call each, which for a thousand-item run is slow
        // enough to defeat the purpose of a pre-run estimate.
        const sampleKeys = contentKeys.slice(0, COST_SAMPLE_SIZE);
        const costs: number[] = [];
        for (const contentKey of sampleKeys) {
          const entry = await contentManager.db.getContentEntry(contentKey);
          if (!entry) {
            continue;
          }
          try {
            const estimate = await estimateAnalysisCost(config!, { entry });
            costs.push(estimate.estimatedCostUsd);
          } catch (e) {
            logger.log("warn", `Could not price ${contentKey} for a bulk estimate: ${e}`);
          }
        }
        if (!costs.length) {
          return sendResponse(res, {
            target,
            itemCount,
            sampledCount: 0,
            note: "Could not work out a cost for these items.",
          } satisfies BulkBackfillEstimate);
        }
        const mean = costs.reduce((total, cost) => total + cost, 0) / costs.length;
        return sendResponse(res, {
          target,
          itemCount,
          estimatedCostUsd: mean * itemCount,
          sampledCount: costs.length,
          note: force
            ? "Re-analysing charges again for items that already have an analysis."
            : undefined,
        } satisfies BulkBackfillEstimate);
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  router.post("/run", async (req, res) => {
    await zodParseHttp(BulkBackfillRequest, req, res, async ({ target, contentKeys, force }) => {
      try {
        if (target === "ai_analysis" && !AiAnalysisConfigUtils.isUsable(configService.config.aiAnalysis)) {
          return sendError(res, "AI analysis is not enabled, or no API key has been set", 400);
        }
        if (target === "subtitles" && !configService.config.subtitles?.servicePriorities?.length) {
          return sendError(res, "No subtitles services are configured", 400);
        }

        const language = configuredLanguage();
        // A first pass here keeps obviously-inapplicable items out of the
        // run entirely, so the task's progress count means something. The
        // task re-checks each item again when it reaches it, which is what
        // actually guards against the list going stale mid-run.
        const queued: string[] = [];
        let skipped = 0;
        for (const contentKey of contentKeys) {
          const entry = await contentManager.db.getContentEntry(contentKey);
          if (!entry || !isRelevant(entry, target)) {
            skipped++;
            continue;
          }
          queued.push(contentKey);
        }
        if (!queued.length) {
          return sendError(res, "None of the selected items can take this action", 400);
        }

        const task = contentManager.taskManager.bulkBackfill(queued, target, force, language);
        return sendResponse(res, {
          message: "Bulk backfill started",
          taskId: task.task.id,
          queued: queued.length,
          skipped,
        });
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  return router;
};
