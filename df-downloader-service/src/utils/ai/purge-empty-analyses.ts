import { AiAnalysisResult, logger } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * An analysis that is taking up the slot without holding anything useful.
 *
 * Two kinds, and both block a re-run for the same reason: the scheduled
 * backfill skips any item that has a record at all, so a result with nothing
 * in it is not merely useless - it is permanent.
 *
 * - One that errored. Nothing was produced, and the record exists only to say
 *   so.
 * - One that "succeeded" with no summary, no conclusion, no extracted data
 *   and no tags. That is what degenerate model output stores as, and it is
 *   indistinguishable from a good result to everything downstream.
 *
 * A tags-only run is deliberately safe here: it has tags, so it is kept. So
 * is a run with structured data but no prose, which is what a configuration
 * with the summary feature off produces.
 */
export const producedNothing = (result: AiAnalysisResult): boolean =>
  Boolean(result.error) ||
  (!result.summary?.trim() &&
    !result.conclusion?.trim() &&
    !result.structuredData &&
    (result.tags?.length ?? 0) === 0);

export type PurgeEmptyAnalysesResult = {
  /** How many stored analyses were examined. */
  examined: number;
  /** The content keys that hold nothing, with why and what they claim to be. */
  empty: { contentKey: string; contentType: string; model?: string; reason: "errored" | "no content" }[];
  /** False when this was a dry run and nothing was actually deleted. */
  removed: boolean;
};

/**
 * Finds - and optionally removes - analyses that produced nothing.
 *
 * Removal rather than a flag, because removal is what makes them eligible
 * again: the scheduled window picks up anything with no analysis, so deleting
 * an empty one is enough for it to be redone overnight without anyone running
 * a bulk job by hand during the day.
 *
 * Defaults to a dry run. This deletes results, and a caller that has not
 * looked at the list first should not be deleting anything.
 */
export const purgeEmptyAnalyses = async (
  db: DfDownloaderOperationalDb,
  { dryRun = true }: { dryRun?: boolean } = {}
): Promise<PurgeEmptyAnalysesResult> => {
  const all = await db.getAllAiAnalysisResults();
  const empty = all
    .filter(({ result }) => producedNothing(result))
    .map(({ contentKey, result }) => ({
      contentKey,
      contentType: result.contentType,
      model: result.model,
      reason: (result.error ? "errored" : "no content") as "errored" | "no content",
    }));

  if (!dryRun) {
    for (const { contentKey } of empty) {
      await db.setAiAnalysis(contentKey, undefined);
    }
    logger.log(
      "info",
      `Removed ${empty.length} empty analyses of ${all.length} - they will be picked up again by a scheduled or bulk run`
    );
  } else {
    logger.log("info", `${empty.length} of ${all.length} stored analyses hold nothing (dry run, nothing removed)`);
  }

  return { examined: all.length, empty, removed: !dryRun };
};

/**
 * An analysis that looks wrong, as opposed to one that is obviously empty.
 *
 * This exists because of the Intel GPU corruption (see
 * docs/GPU_ACCELERATION_FINDINGS.md): a broken compute backend does not fail,
 * it returns a confident classification and a plausible-looking summary. Those
 * pass every check the app has, count as analysed, and are then skipped
 * forever by the scheduled backfill because a record exists.
 *
 * There is no reliable test for "wrong but plausible" - if there were, the
 * analysis could apply it itself and reject the result. So this is deliberately
 * two things at once: signals that genuinely indicate corruption, and a plain
 * time window, which is the honest lever when you know roughly when a run was
 * broken and cannot tell item by item.
 */
export type SuspectAnalysis = {
  contentKey: string;
  contentType: string;
  model?: string;
  analysedAt?: string;
  /** Why it was picked out. Empty when only the window matched. */
  reasons: string[];
};

export type FindSuspectOptions = {
  /** Only analyses at or after this moment. */
  from?: Date;
  /** Only analyses at or before this moment. */
  to?: Date;
  /** Substring match on the recorded model, e.g. "qwen" for local runs. */
  model?: string;
};

/**
 * Signals that a result came from a broken engine rather than a bad judgement.
 *
 * Each of these was observed from the Vulkan corruption. A confidence of
 * exactly 0 or 1 is included because no healthy run of this model has produced
 * one - measured answers sit around 0.95 - but it is the weakest of the three
 * and is reported rather than acted on alone.
 */
const corruptionSignals = (result: AiAnalysisResult): string[] => {
  const reasons: string[] = [];
  const confidence = (result as { contentTypeConfidence?: number }).contentTypeConfidence;
  if (typeof confidence === "number" && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    reasons.push(`confidence of ${confidence}, which no working model produces`);
  } else if (confidence === 0 || confidence === 1) {
    reasons.push(`confidence of exactly ${confidence}`);
  }
  const summary = `${result.summary ?? ""} ${result.conclusion ?? ""}`.trim();
  if (summary) {
    const letters = summary.match(/[a-zA-Z]/g)?.length ?? 0;
    if (letters < 20) {
      reasons.push("almost no readable text in the summary");
    } else {
      const words = summary.toLowerCase().match(/[a-z0-9']+/g) ?? [];
      const distinct = words.length ? new Set(words).size / words.length : 1;
      if (words.length >= 12 && distinct < 0.35) {
        reasons.push(`summary repeats itself (${Math.round(distinct * 100)}% distinct)`);
      }
    }
  }
  return reasons;
};

/** Analyses matching the filters, with any corruption signals noted. */
export const findSuspectAnalyses = async (
  db: DfDownloaderOperationalDb,
  { from, to, model }: FindSuspectOptions = {}
): Promise<SuspectAnalysis[]> => {
  const all = await db.getAllAiAnalysisResults();
  return all
    .filter(({ result }) => {
      const at = result.analysedAt ? new Date(result.analysedAt) : undefined;
      if (from && (!at || at < from)) {
        return false;
      }
      if (to && (!at || at > to)) {
        return false;
      }
      return !(model && !(result.model ?? "").toLowerCase().includes(model.toLowerCase()));
    })
    .map(({ contentKey, result }) => ({
      contentKey,
      contentType: result.contentType,
      model: result.model,
      analysedAt: result.analysedAt ? new Date(result.analysedAt).toISOString() : undefined,
      reasons: [...corruptionSignals(result), ...(producedNothing(result) ? ["produced nothing"] : [])],
    }));
};

/**
 * Removes named analyses, so those videos become eligible again.
 *
 * Deletion rather than a flag, for the same reason as the empty purge: the
 * scheduled window picks up anything with no analysis, so removing one is all
 * it takes for it to be redone overnight.
 */
export const purgeAnalyses = async (db: DfDownloaderOperationalDb, contentKeys: string[]): Promise<number> => {
  for (const contentKey of contentKeys) {
    await db.setAiAnalysis(contentKey, undefined);
  }
  logger.log("info", `Removed ${contentKeys.length} analyses by request - they will be picked up by a later run`);
  return contentKeys.length;
};
