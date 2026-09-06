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
