import { z } from "zod";
import { AiAnalysisModel } from "../config/ai-analysis-config.js";

/**
 * What the stored analysis for one item cost.
 *
 * One entry per analysed item, not per run - a result is held as a single
 * blob on the content entry, so re-analysing replaces it and the earlier
 * run's cost goes with it. This therefore reports what the analyses you
 * currently hold cost to produce, which is not the same as everything ever
 * spent. Making it the latter needs spend recorded somewhere a re-run does
 * not overwrite.
 */
export const AiCostLedgerEntry = z.object({
  contentKey: z.string(),
  title: z.string(),
  model: AiAnalysisModel,
  analysedAt: z.coerce.date(),
  costUsd: z.number().default(0),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  /** A run that failed still spent tokens getting there. */
  hasError: z.boolean().default(false),
});
export type AiCostLedgerEntry = z.infer<typeof AiCostLedgerEntry>;

/** Spend grouped by model, so an expensive choice is visible as one. */
export const AiCostByModel = z.object({
  model: AiAnalysisModel,
  runCount: z.number().default(0),
  costUsd: z.number().default(0),
});
export type AiCostByModel = z.infer<typeof AiCostByModel>;

/**
 * What the analyses this installation currently holds cost to produce.
 *
 * Read from the stored results rather than tracked separately: the figure
 * each run recorded is what it actually cost, so there is nothing to keep in
 * step and nothing to drift. The trade is that it only sees what is still
 * stored - a re-analysed item reports the new run, and the one it replaced
 * is gone.
 *
 * Analyses recorded without usage are counted by runsWithoutCost rather than
 * being folded in as free, which would read as "cost nothing" instead of
 * "not known".
 */
export const AiCostLedgerResponse = z.object({
  entries: z.array(AiCostLedgerEntry),
  totalCostUsd: z.number().default(0),
  runCount: z.number().default(0),
  /** Stored runs with no usage recorded, so not counted in the total. */
  runsWithoutCost: z.number().default(0),
  byModel: z.array(AiCostByModel),
});
export type AiCostLedgerResponse = z.infer<typeof AiCostLedgerResponse>;
