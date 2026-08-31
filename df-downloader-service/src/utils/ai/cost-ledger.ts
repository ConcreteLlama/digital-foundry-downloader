import { AiCostByModel, AiCostLedgerEntry, AiCostLedgerResponse } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * What the stored analyses cost to produce.
 *
 * One row per analysed item rather than per run: a result is a single blob
 * on the content entry, so a re-analysis overwrites its predecessor and that
 * run's cost is no longer anywhere to be read. Worth knowing before treating
 * the total as everything ever spent.
 *
 * Built from the stored results rather than from the analysis index, which
 * records what a run produced but not what it spent - cost lives only on the
 * full result. Reading the results is the same trade the game index and
 * platform comparison already make, and it means every run ever stored is
 * counted without a migration to backfill a figure that was recorded
 * correctly all along.
 *
 * Aggregated here rather than in the browser for the same reason as those
 * two: results are several kilobytes each, and drawing one table is no
 * reason to ship all of them.
 */
export const buildCostLedger = async (db: DfDownloaderOperationalDb): Promise<AiCostLedgerResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const entries = await db.getAllContentEntries();
  const titles = new Map(entries.map((entry) => [entry.contentInfo.key, entry.contentInfo.title]));

  const ledger: AiCostLedgerEntry[] = [];
  const byModel = new Map<string, AiCostByModel>();
  let totalCostUsd = 0;
  let runsWithoutCost = 0;

  for (const { contentKey, result } of results) {
    if (!result.usage) {
      // Analysed before usage was recorded, or by something that did not
      // report it. Counted separately rather than as a free run, which would
      // read as "this cost nothing" instead of "this is not known".
      runsWithoutCost++;
      continue;
    }
    const { costUsd, inputTokens, outputTokens } = result.usage;
    ledger.push({
      contentKey,
      // Falls back to the key so a run whose content has since been removed
      // still appears - it was still paid for.
      title: titles.get(contentKey) ?? contentKey,
      model: result.model,
      analysedAt: result.analysedAt,
      costUsd,
      inputTokens,
      outputTokens,
      hasError: Boolean(result.error),
    });
    totalCostUsd += costUsd;

    const existing = byModel.get(result.model) ?? { model: result.model, runCount: 0, costUsd: 0 };
    existing.runCount++;
    existing.costUsd += costUsd;
    byModel.set(result.model, existing);
  }

  // Newest first: the run you just paid for is the one you came to look at.
  ledger.sort((a, b) => b.analysedAt.getTime() - a.analysedAt.getTime());

  return {
    entries: ledger,
    totalCostUsd,
    runCount: ledger.length,
    runsWithoutCost,
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
  };
};
