import {
  AiAnalysisResult,
  AnalyseContentRequest,
  AiTagDecisionRequest,
  AiSelfTestRequest,
  TestAiProviderRequest,
  ScheduledBackfillPreviewRequest,
  DfArticleUtils,
  DfContentEntry,
  logger,
} from "df-downloader-common";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import express from "express";
import { configService } from "../../config/config.js";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { estimateAnalysisCost } from "../../utils/ai/analyse.js";
import { findSuspectAnalyses, purgeAnalyses, purgeEmptyAnalyses } from "../../utils/ai/purge-empty-analyses.js";
import { getLocalSetupStatus } from "../../utils/ai/local-server.js";
import { runLocalAnalysisSelfTest } from "../../utils/ai/self-test.js";
import { makeProvider } from "../../utils/ai/providers/resolve.js";
import { buildGameIndex } from "../../utils/ai/game-index.js";
import { buildHardwareIndex } from "../../utils/ai/hardware-index.js";
import { buildPcSettingsIndex } from "../../utils/ai/pc-settings-index.js";
import { buildCostLedger } from "../../utils/ai/cost-ledger.js";
import { buildPlatformComparison } from "../../utils/ai/platform-comparison.js";
import { buildAnalysisCatalogue } from "../../utils/ai/analysis-catalogue.js";
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
  /** Every analysed item, flat and filterable - see buildAnalysisCatalogue. */
  /**
   * Finds analyses that hold nothing, and removes them when asked to.
   *
   * Removal is what makes them eligible again - the scheduled window picks up
   * anything with no analysis at all - so this is how a library full of blank
   * results gets redone overnight rather than by running a bulk job in the
   * middle of the day.
   *
   * A dry run unless `confirm` is set, because this deletes results.
   */
  router.post("/purge-empty", async (req, res) => {
    try {
      const confirm = req.body?.confirm === true;
      return sendResponse(res, await purgeEmptyAnalyses(contentManager.db, { dryRun: !confirm }));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  router.get("/catalogue", async (_req, res) => {
    try {
      return sendResponse(res, await buildAnalysisCatalogue(contentManager.db));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  router.get("/game-index", async (_req, res) => {
    try {
      return sendResponse(res, await buildGameIndex(contentManager.db));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * What analysis has cost, run by run.
   *
   * Aggregated server-side for the same reason as the two below - drawing
   * one table is no reason to ship every result to the browser.
   */
  router.get("/costs", async (_req, res) => {
    try {
      return sendResponse(res, await buildCostLedger(contentManager.db));
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
   * Every PC review's optimised settings, side by side.
   *
   * The data was already extracted per video and readable only one item at a
   * time, so "which of my games have recommended settings" had no answer
   * despite the answer being on disk.
   */
  router.get("/pc-settings", async (_req, res) => {
    try {
      return sendResponse(res, await buildPcSettingsIndex(contentManager.db));
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /** Every analysed hardware review, newest first. */
  router.get("/hardware", async (_req, res) => {
    try {
      return sendResponse(res, await buildHardwareIndex(contentManager.db));
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
  /**
   * Everything the scheduled backfill panel shows.
   *
   * A POST rather than a GET because it answers about the schedule *on
   * screen*: the eligibility toggles change the eligible count, and a preview
   * that only updated on save would be a preview of the previous settings.
   * Omitting the draft asks about what is saved, which is what the AI Analysis
   * page's summary link needs.
   *
   * Deliberately does not go through resolveContext. The state this most has
   * to describe correctly is the one where no engine is configured at all -
   * refusing there would leave the panel unable to say what is missing.
   */
  router.post("/scheduled-backfill/preview", async (req, res) => {
    await zodParseHttp(ScheduledBackfillPreviewRequest, req, res, async ({ draft }) => {
      const backfill = contentManager.scheduledBackfill;
      if (!backfill) {
        // Only reachable in the seconds before start() finishes, since the
        // feeder is created there. Saying so beats an empty panel.
        return sendError(res, "The scheduler is still starting up", 503);
      }
      try {
        return sendResponse(res, await backfill.status(draft));
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

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

  /**
   * Checks a provider's credentials without running an analysis.
   *
   * Counts tokens rather than generating any. That validates the credential
   * and that the endpoint is reachable, costs nothing on Anthropic's side
   * because token counting is not billed, and cannot leave a half-finished
   * analysis attached to a video. For the local provider it proves the server
   * URL actually answers, which is the equivalent failure.
   *
   * Reports a bad key as {ok:false} with HTTP 200 - the caller is a settings
   * form asking a question, and "your key is wrong" is an answer.
   */
  router.post("/test-provider", async (req, res) => {
    await zodParseHttp(TestAiProviderRequest, req, res, async ({ provider, config }) => {
      try {
        const resolved = makeProvider(config, provider);
        await resolved.countInputTokens(
          "You are a configuration test.",
          "This request exists only to check credentials.",
          "No reply is needed."
        );
        return sendResponse(res, {
          ok: true,
          detail:
            provider === "local"
              ? `Reached the local model server, serving ${resolved.model}.`
              : `Anthropic accepted the key, using ${resolved.model}.`,
        });
      } catch (e: any) {
        const message = String(e?.message ?? e);
        return sendResponse(res, {
          ok: false,
          error:
            message.includes("401") || message.toLowerCase().includes("authentication")
              ? `${message} - the API key looks wrong or expired.`
              : message,
        });
      }
    });
  });

  /**
   * Checks that local analysis actually works, rather than merely answering.
   *
   * A separate endpoint from /test-provider on purpose: that one counts
   * tokens, which is free and instant and proves the server is reachable.
   * This runs a real grammar-constrained generation against a fixture with a
   * known answer, which costs a minute of the machine and is the only thing
   * that catches an engine returning well-formed nonsense.
   *
   * Reports a broken engine as {ok:false} with HTTP 200, like the provider
   * test - a settings form asked a question, and "it is answering nonsense"
   * is an answer rather than a server error.
   */
  /**
   * What the local engine is doing right now, for something that is waiting.
   *
   * Exists because the self-test is one blocking request that can legitimately
   * take minutes - the model is gigabytes, and the first run downloads it -
   * during which a button that says "Testing..." is indistinguishable from a
   * button that has hung. The server already tracks this for the analysis
   * task's progress; this just makes it readable by anything else.
   *
   * A plain GET returning whatever is current, rather than anything tied to a
   * particular test run. There is only ever one local server, so "what is it
   * doing" has a single answer and no session to key it to.
   */
  router.get("/local-status", async (_req, res) => {
    return sendResponse(res, { status: getLocalSetupStatus() });
  });

  router.post("/self-test", async (req, res) => {
    await zodParseHttp(AiSelfTestRequest, req, res, async ({ config }) => {
      try {
        return sendResponse(res, await runLocalAnalysisSelfTest(config));
      } catch (e) {
        return sendErrorAsResponse(res, e);
      }
    });
  });

  /**
   * Analyses that may have come from a broken engine, rather than empty ones.
   *
   * Separate from purge-empty because the problem is different: a corrupt
   * compute backend returns a confident classification and a plausible
   * summary, which passes every check the app has - see
   * docs/GPU_ACCELERATION_FINDINGS.md. There is no reliable test for "wrong
   * but plausible", so this reports what it can detect and otherwise lets the
   * caller pick a time window, which is the honest lever when you know when a
   * run was broken but not which items it spoiled.
   *
   * Never deletes. The caller looks first and then names what to remove.
   */
  router.post("/suspect", async (req, res) => {
    const body = (req.body ?? {}) as { from?: string; to?: string; model?: string };
    const parseDate = (value?: string) => {
      if (!value) {
        return undefined;
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };
    try {
      const analyses = await findSuspectAnalyses(contentManager.db, {
        from: parseDate(body.from),
        to: parseDate(body.to),
        model: body.model,
      });
      return sendResponse(res, { analyses });
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  /**
   * Removes named analyses, putting those videos back in the queue.
   *
   * By explicit key rather than by filter, deliberately: this throws away
   * results, and the caller having listed them first is what makes that a
   * decision rather than an accident.
   */
  router.post("/purge", async (req, res) => {
    const keys = (req.body?.contentKeys ?? []) as unknown;
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
      return sendError(res, "contentKeys must be a list of content keys", 400);
    }
    if (!keys.length) {
      return sendError(res, "No analyses were named", 400);
    }
    try {
      const removed = await purgeAnalyses(contentManager.db, keys as string[]);
      return sendResponse(res, { removed });
    } catch (e) {
      return sendErrorAsResponse(res, e);
    }
  });

  router.post("/analyse", async (req, res) => {
    await zodParseHttp(AnalyseContentRequest, req, res, async ({ contentKey, force, sources, provider }) => {
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
        // Not looked up at all when the article is deselected. The lookup can
        // reach Digital Foundry, so "don't use the article" has to mean the
        // request is never made rather than made and then discarded.
        const effectiveSources = sources ?? config.sources;
        const article = effectiveSources.article
          ? await ensureArticleForContent(contentManager.db, entry.contentInfo, {
              priority: DfFetchPriority.INTERACTIVE,
            })
          : undefined;
        contentManager.taskManager.analyseContent(entry, config, {
          articleText: article?.text,
          articleUrl: article?.url,
          articleTitle: article?.title,
          sources,
          provider,
          // Carried through, not just used for the guard above. Without it the
          // task's own already-analysed check saw force as undefined and
          // returned the stored result, so Re-analyse reported success and
          // changed nothing for anything that had ever been analysed - which
          // is every item the button is offered on.
          force,
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
        // Pages that embed this video without being about it. Kept
        // separate from the companion piece throughout: they are worth
        // reading, but they are not what an analysis is grounded on.
        relatedArticles: state?.relatedArticles ?? [],
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
