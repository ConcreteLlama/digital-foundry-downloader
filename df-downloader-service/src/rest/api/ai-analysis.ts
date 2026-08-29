import {
  AiAnalysisResult,
  AnalyseContentRequest,
  AiTagDecisionRequest,
  DfArticleUtils,
  DfContentEntry,
  logger,
} from "df-downloader-common";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import express from "express";
import { configService } from "../../config/config.js";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { estimateAnalysisCost } from "../../utils/ai/analyse.js";
import { buildGameIndex } from "../../utils/ai/game-index.js";
import { buildPlatformComparison } from "../../utils/ai/platform-comparison.js";
import { ensureArticleForContent } from "../../utils/df-articles/ensure-article.js";
import { DfFetchPriority } from "../../df-request-queue.js";
import { sanitizeContentName } from "../../utils/df-utils.js";
import { sendError, sendErrorAsResponse, sendResponse, zodParseHttp } from "../utils/utils.js";

/**
 * Resolves the entry and the config together, since every route here
 * needs both and each has its own way of being unusable.
 */
type ResolvedContext =
  | { ok: false; error: string; status: number }
  | { ok: true; entry: DfContentEntry; config: NonNullable<typeof configService.config.aiAnalysis> };

const resolveContext = async (
  contentManager: DigitalFoundryContentManager,
  contentKey: string
): Promise<ResolvedContext> => {
  const config = configService.config.aiAnalysis;
  if (!AiAnalysisConfigUtils.isUsable(config)) {
    return { ok: false, error: "AI analysis is not enabled, or no API key has been set", status: 400 };
  }
  const entry = await contentManager.db.getContentEntry(sanitizeContentName(contentKey));
  if (!entry) {
    return { ok: false, error: "Content not found", status: 404 };
  }
  return { ok: true, entry, config: config! };
};

export const makeAiAnalysisRouter = (contentManager: DigitalFoundryContentManager) => {
  const router = express.Router();

  /**
   * The stored analysis for one item.
   *
   * Read straight from the per-item store rather than from the content
   * entry - results deliberately do not live in either content DB (see
   * db/ai-analysis-store.ts), so this is the only place they come from.
   */
  router.get("/result/:contentKey", async (req, res) => {
    try {
      const contentKey = sanitizeContentName(req.params.contentKey);
      const result = await contentManager.db.getAiAnalysis(contentKey);
      if (!result) {
        return sendError(res, "No analysis found for this content", 404);
      }
      return sendResponse(res, result);
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * The whole index in one call.
   *
   * Served as a lump rather than per item on purpose: it is small (a few
   * hundred bytes per analysed item, held in memory anyway) and the
   * content list would otherwise need one request per row to know which
   * items carry an analysis.
   */
  router.get("/index", async (_req, res) => {
    try {
      return sendResponse(res, { entries: contentManager.db.getAiAnalysisIndex() });
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * Analysed content grouped by the game it covers.
   *
   * Aggregated server-side rather than by shipping every result to the
   * browser: results are per-file and several kilobytes each, so the
   * client has no business reading them all to draw a list.
   */
  router.get("/game-index", async (_req, res) => {
    try {
      return sendResponse(res, await buildGameIndex(contentManager.db));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * Every console comparison, side by side.
   *
   * Aggregated server-side for the same reason as the game index - the
   * browser has no business reading every result to draw a table.
   */
  router.get("/platform-comparison", async (_req, res) => {
    try {
      return sendResponse(res, await buildPlatformComparison(contentManager.db));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * What a run would cost, without running it.
   *
   * A real request to the token-counting endpoint rather than a local
   * guess - the point of the number is that it is worth trusting.
   */
  router.post("/estimate", async (req, res) => {
    await zodParseHttp(AnalyseContentRequest, req, res, async ({ contentKey }) => {
      const context = await resolveContext(contentManager, contentKey);
      if (!context.ok) {
        return sendError(res, context.error, context.status);
      }
      try {
        const estimate = await estimateAnalysisCost(context.config, { entry: context.entry });
        return sendResponse(res, estimate);
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  router.post("/analyse", async (req, res) => {
    await zodParseHttp(AnalyseContentRequest, req, res, async ({ contentKey, force }) => {
      const context = await resolveContext(contentManager, contentKey);
      if (!context.ok) {
        return sendError(res, context.error, context.status);
      }
      const { entry, config } = context;

      // Analysis costs money per run, so re-analysing something already
      // analysed has to be asked for rather than being the default an
      // accidental double-click produces.
      if (!force && contentManager.db.getAiAnalysisIndexEntry(entry.key)) {
        return sendError(res, "This content has already been analysed - re-run with force to analyse it again", 409);
      }

      try {
        // Looked up before the run rather than during it, and awaited:
        // a matched article is grounding the analysis should have, not a
        // display extra. It is written text, so its product names and
        // figures are correct by construction where a transcript's may
        // not be - which is exactly what the extraction needs most.
        // Interactive priority because a person is waiting on this.
        const article = await ensureArticleForContent(contentManager.db, entry.contentInfo, {
          priority: DfFetchPriority.INTERACTIVE,
        });
        contentManager.taskManager.analyseContent(entry, config, {
          articleText: article?.text,
          articleUrl: article?.url,
          articleTitle: article?.title,
        });
        return sendResponse(res, { message: "Analysis started", contentKey: entry.key, articleMatched: Boolean(article) });
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  /**
   * Accept or reject one suggested tag.
   *
   * Accepting writes the tag onto the content immediately - that is the
   * point of the suggest-then-confirm flow, and leaving an accepted tag
   * unapplied until some later pass would make the button appear to do
   * nothing. Rejected tags are kept in the record rather than deleted, so
   * the same wrong suggestion is not re-offered after a re-analysis.
   */
  router.post("/tag-decision", async (req, res) => {
    await zodParseHttp(AiTagDecisionRequest, req, res, async ({ contentKey, tag, status }) => {
      try {
        const key = sanitizeContentName(contentKey);
        const entry = await contentManager.db.getContentEntry(key);
        if (!entry) {
          return sendError(res, "Content not found", 404);
        }
        const analysis = await contentManager.db.getAiAnalysis(key);
        if (!analysis) {
          return sendError(res, "No analysis found for this content", 404);
        }
        const target = analysis.tags.find((candidate) => candidate.tag === tag);
        if (!target) {
          return sendError(res, `No suggested tag "${tag}" on this analysis`, 404);
        }

        const updated: AiAnalysisResult = {
          ...analysis,
          tags: analysis.tags.map((candidate) => (candidate.tag === tag ? { ...candidate, status } : candidate)),
        };
        await contentManager.db.setAiAnalysis(key, updated);

        if (status === "accepted") {
          await applyTag(contentManager, entry, tag);
        } else if (status === "rejected") {
          await removeTag(contentManager, entry, tag);
        }
        return sendResponse(res, updated);
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  /**
   * The matched article for one item, looking for one if a search is due.
   *
   * Triggered by a person opening a content panel, never by the scan or
   * poll loop. `DfArticleUtils.shouldRetry` decides whether this actually
   * costs a request: a match is permanent and never re-searched, and a
   * miss backs off rather than re-running on every open - but a miss is
   * never final, because the article may simply not be written yet.
   */
  router.get("/article/:contentKey", async (req, res) => {
    try {
      const contentKey = sanitizeContentName(req.params.contentKey);
      const entry = await contentManager.db.getContentEntry(contentKey);
      if (!entry) {
        return sendError(res, "Content not found", 404);
      }
      // Reading this does NOT search Digital Foundry by default.
      //
      // The notes doc suggested searching on every content-panel open, but
      // that turns idle browsing into site traffic - open twenty items and
      // that is twenty lookups against a site asking for a five-second
      // crawl delay. Merely looking at content is not a request for it, so
      // a plain read returns what is already known and searching is an
      // explicit act. An analysis run still searches on its own, because
      // there the article materially improves the result being paid for.
      const shouldSearch = req.query.search === "true" || req.query.force === "true";
      const article = shouldSearch
        ? await ensureArticleForContent(contentManager.db, entry.contentInfo, {
            priority: DfFetchPriority.INTERACTIVE,
            force: req.query.force === "true",
          })
        : (await contentManager.db.getDfArticleLookup(contentKey))?.article;
      const state = await contentManager.db.getDfArticleLookup(contentKey);
      return sendResponse(res, {
        article: article ?? null,
        lastAttemptedAt: state?.lastAttemptedAt ?? null,
        missCount: state?.missCount ?? 0,
        // "not yet" rather than "never" - surfaced so the UI can say when
        // it will look again instead of implying no article exists.
        nextRetryAt: state ? DfArticleUtils.nextRetryAt(state) ?? null : null,
        lastError: state?.lastError ?? null,
        /** Whether a search would happen if asked - drives the UI's affordance. */
        searchDue: DfArticleUtils.shouldRetry(state),
      });
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  return router;
};

/** Case-insensitive, so accepting "PC Performance" onto content already tagged "PC performance" is a no-op. */
const applyTag = async (contentManager: DigitalFoundryContentManager, entry: DfContentEntry, tag: string) => {
  const existing = entry.contentInfo.tags ?? [];
  if (existing.some((candidate) => candidate.toLowerCase() === tag.toLowerCase())) {
    return;
  }
  await contentManager.db.setContentInfos([{ ...entry.contentInfo, tags: [...existing, tag] }]);
  logger.log("info", `Applied AI-suggested tag "${tag}" to ${entry.key}`);
};

/**
 * Rejecting a tag also takes it off the content, which matters for the
 * auto-apply mode: there, the tag was already written, and "reject" has to
 * mean "undo that" rather than only marking the suggestion.
 */
const removeTag = async (contentManager: DigitalFoundryContentManager, entry: DfContentEntry, tag: string) => {
  const existing = entry.contentInfo.tags ?? [];
  const remaining = existing.filter((candidate) => candidate.toLowerCase() !== tag.toLowerCase());
  if (remaining.length === existing.length) {
    return;
  }
  await contentManager.db.setContentInfos([{ ...entry.contentInfo, tags: remaining }]);
  logger.log("info", `Removed AI-suggested tag "${tag}" from ${entry.key}`);
};
