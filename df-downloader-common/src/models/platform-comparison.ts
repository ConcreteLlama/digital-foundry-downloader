import { z } from "zod";

/**
 * Every console comparison laid out side by side.
 *
 * ## What this is, and what it deliberately is not
 *
 * A ledger: Digital Foundry's own per-platform figures, presented next to
 * each other so they can be read across. It aggregates *nothing*. There is
 * no score, no ranking, and no "which platform wins" column.
 *
 * That omission is a finding, not caution. Measured across the real
 * corpus, `fpsMeasuredAvg` was absent from **95 of 105** platform modes -
 * and its absence is not random, since a measured figure gets quoted
 * precisely when a difference is large enough to be worth quoting. Any
 * average over the surviving 10% would lean hard towards the videos with
 * dramatic gaps while looking like a summary of all of them. Presenting
 * the cells directly has the opposite property: a gap is visibly a gap.
 *
 * ## Why modes are not aligned across platforms
 *
 * A face-off is won or lost per mode, so the obvious table would put
 * matching modes on the same row. The data does not support it. Mode
 * labels are free text and the corpus contains "Performance" and
 * "Performance Mode" and "60fps Performance Mode" as separate strings, plus
 * "Default", "Standard", "Balanced" and "Graphics Mode" - there is no
 * shared vocabulary to match on. Guessing an alignment from label
 * similarity would silently put unrelated modes on the same line, which is
 * worse than not aligning them: the reader would have no way to tell.
 *
 * So each cell lists that platform's own modes as the video described
 * them, and the reader does the comparing.
 */

export const PlatformMode = z.object({
  label: z.string(),
  resolution: z.string().nullish(),
  fpsTarget: z.number().nullish(),
  /** Present in roughly a tenth of real modes - see the note above. */
  fpsMeasuredAvg: z.number().nullish(),
  notes: z.string().nullish(),
});
export type PlatformMode = z.infer<typeof PlatformMode>;

/** A platform entry the canonical column list does not recognise. */
export const UnrecognisedPlatform = z.object({
  /** As the extraction produced it, unaltered. */
  platform: z.string(),
  modes: z.array(PlatformMode).default([]),
});
export type UnrecognisedPlatform = z.infer<typeof UnrecognisedPlatform>;

export const PlatformComparisonRow = z.object({
  contentKey: z.string(),
  title: z.string(),
  publishedDate: z.coerce.date(),
  game: z.string().nullish(),
  developer: z.string().nullish(),
  /** Canonical platform label to that platform's modes. */
  platforms: z.record(z.string(), z.array(PlatformMode)).default({}),
  /**
   * Platform entries that did not match the canonical list.
   *
   * Kept and shown rather than dropped. Some are real platforms the list
   * has not caught up with; at least one in the real corpus is not a
   * platform at all ("General Issues Across All Platforms" - a section
   * heading read as one). Both cases are worth seeing, and neither should
   * be allowed to create a column.
   */
  unrecognised: z.array(UnrecognisedPlatform).default([]),
  knownIssues: z.array(z.string()).default([]),
  /** DF's own recommendation, shown verbatim and attributed. */
  recommendation: z.string().nullish(),
  hasArticle: z.boolean().default(false),
  usedTranscript: z.boolean().default(false),
});
export type PlatformComparisonRow = z.infer<typeof PlatformComparisonRow>;

export const PlatformComparisonResponse = z.object({
  rows: z.array(PlatformComparisonRow).default([]),
  /** Canonical platforms actually present, so empty columns are not drawn. */
  platformsPresent: z.array(z.string()).default([]),
  /** How many console comparisons this is drawn from. */
  comparisonCount: z.number().default(0),
  analysedCount: z.number().default(0),
  libraryCount: z.number().default(0),
  /**
   * How often each field was actually stated, across every mode in the
   * table.
   *
   * Surfaced in the UI rather than kept as a developer curiosity: a reader
   * looking at a table full of blanks deserves to know that the blanks are
   * the normal case and not a loading failure.
   */
  coverage: z
    .object({
      totalModes: z.number().default(0),
      withResolution: z.number().default(0),
      withFpsTarget: z.number().default(0),
      withMeasuredAvg: z.number().default(0),
    })
    .default({ totalModes: 0, withResolution: 0, withFpsTarget: 0, withMeasuredAvg: 0 }),
});
export type PlatformComparisonResponse = z.infer<typeof PlatformComparisonResponse>;
