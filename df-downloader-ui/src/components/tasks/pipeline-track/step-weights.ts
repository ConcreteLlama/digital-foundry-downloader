/**
 * How much of the track each step is worth.
 *
 * Equal widths claimed Measure Duration mattered as much as a 6GB transfer.
 * These are hand-set per step type - a deliberate first pass, not a
 * measurement. The obvious next step is deriving them from observed medians:
 * per-step durations are already recorded and shown in the details dialog, so
 * that needs no schema change.
 *
 * Note Generate Subtitles is weighted HIGHER than Download. That looks wrong
 * until you time it: local Whisper on a two-hour episode can take the better
 * part of an hour, against minutes for the transfer. An honestly weighted
 * track makes transcription the biggest segment, and that is the point.
 *
 * Weights are FIXED, never recomputed from live progress - a segment that
 * resized mid-download would make the progress fill jump backwards.
 */
const STEP_WEIGHTS: Record<string, number> = {
  Download: 2.4,
  "Generate Subtitles": 3.2,
  "Inject Metadata": 1.4,
  "Move File": 1.2,
  "Measure Duration": 0.6,
  "Fetch Chapters": 0.6,
  "Write Subtitles": 0.6,
};

const DEFAULT_WEIGHT = 1;

/**
 * A floor in percent, so a 0.6-weight step among heavy ones stays wide enough
 * to hover, tap and focus - the segments are keyboard-focusable, and a 2px
 * target is not reachable by any of those.
 */
const MIN_SEGMENT_PERCENT = 6;

export const stepWeight = (stepName: string) => STEP_WEIGHTS[stepName] ?? DEFAULT_WEIGHT;

/**
 * Percentage widths for the given steps, floored and renormalised.
 *
 * Computed over whatever the caller passes, which for the card is the VISIBLE
 * subset - so steps hidden as not-applicable do not silently consume width.
 */
export const stepWidthPercents = (stepNames: string[]): number[] => {
  if (stepNames.length === 0) {
    return [];
  }
  const floor = Math.min(MIN_SEGMENT_PERCENT, 100 / stepNames.length);
  const weights = stepNames.map(stepWeight);
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const raw = weights.map((w) => (w / total) * 100);
  // Lift anything under the floor, then take the shortfall back off the
  // segments that can afford it, in proportion - so the row still sums to 100.
  const lifted = raw.map((percent) => Math.max(percent, floor));
  const surplus = lifted.reduce((sum, p) => sum + p, 0) - 100;
  if (surplus <= 0) {
    return lifted;
  }
  const spare = lifted.map((p) => Math.max(p - floor, 0));
  const spareTotal = spare.reduce((sum, p) => sum + p, 0) || 1;
  return lifted.map((p, i) => p - (spare[i] / spareTotal) * surplus);
};
