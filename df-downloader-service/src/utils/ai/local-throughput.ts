import { serviceLocator } from "../../services/service-locator.js";

/**
 * How fast this machine actually analyses, learned from what it has done.
 *
 * There is no useful built-in figure. The same model runs an analysis in about
 * twelve seconds on a desktop GPU and somewhere between twelve and twenty
 * minutes on a passively-cooled microserver - more than two orders of
 * magnitude - so any constant shipped here would be wrong for almost everyone
 * and would misinform the one decision the estimate exists to support.
 *
 * The run log already records tokens and duration for every local run, so the
 * honest answer is to measure. Before the first local run there is no answer,
 * and saying so is better than inventing one.
 */

/** Ignores the first run, whose duration includes loading the model. */
const MIN_RUNS = 2;

/**
 * Tokens per millisecond across every local run recorded.
 *
 * Combined rather than split by prefill and generation: the log does not
 * attribute duration to each phase, and they differ by roughly seven times.
 * That makes this approximate for an unusual input mix - a very long
 * transcript with a short answer is mostly prefill - but a backfill's items
 * resemble each other, which is the case that matters.
 */
export const observedLocalTokensPerMs = (): number | undefined => {
  const entries = serviceLocator.db.getAiCostLog().entries.filter((entry) => entry.durationMs);
  if (entries.length < MIN_RUNS) {
    return undefined;
  }
  let tokens = 0;
  let ms = 0;
  for (const entry of entries) {
    tokens += (entry.inputTokens ?? 0) + (entry.outputTokens ?? 0);
    ms += entry.durationMs ?? 0;
  }
  return ms > 0 ? tokens / ms : undefined;
};

/** What a run of this size would take here, or undefined with no history. */
export const estimateLocalDurationMs = (inputTokens: number, outputTokens: number): number | undefined => {
  const rate = observedLocalTokensPerMs();
  return rate ? Math.round((inputTokens + outputTokens) / rate) : undefined;
};
