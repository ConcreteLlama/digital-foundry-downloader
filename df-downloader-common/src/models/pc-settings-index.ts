import { z } from "zod";

/**
 * The settings knowledge base: every PC review's optimised settings, side by
 * side.
 *
 * The data for this was already being extracted per video and could only be
 * read one item at a time, so "which of my games have recommended settings,
 * and what did they say about shadows" was unanswerable despite the answer
 * being on disk.
 *
 * Nothing here is averaged. A setting's performance cost is quoted per game,
 * never pooled across them: the figures come from different scenes on
 * different hardware at different resolutions, so a mean over them would be a
 * number with no referent - the same reasoning that keeps a score column off
 * the platform comparison ledger.
 */
export const PcSettingsEntry = z.object({
  name: z.string(),
  levelsTested: z.array(z.string()).default([]),
  /** Performance cost as a percentage, when the video actually stated one. */
  perfDeltaPct: z.number().nullish(),
  consoleEquivalent: z.string().nullish(),
  recommendation: z.string().nullish(),
  timestampSeconds: z.number().nullish(),
});
export type PcSettingsEntry = z.infer<typeof PcSettingsEntry>;

export const PcSettingsRow = z.object({
  contentKey: z.string(),
  title: z.string(),
  publishedDate: z.coerce.date(),
  game: z.string().nullish(),
  engine: z.string().nullish(),
  verdict: z.string().nullish(),
  bottleneck: z.string().nullish(),
  settings: z.array(PcSettingsEntry).default([]),
  /** The before/after of applying the optimised settings, where given. */
  optimised: z
    .object({
      testSystem: z.string().nullish(),
      fpsBefore: z.number().nullish(),
      fpsAfter: z.number().nullish(),
      gainPct: z.number().nullish(),
    })
    .nullish(),
  hasArticle: z.boolean().default(false),
  usedTranscript: z.boolean().default(false),
});
export type PcSettingsRow = z.infer<typeof PcSettingsRow>;

/**
 * How often a given setting gets called out across the whole corpus.
 *
 * A count, deliberately - not an average cost. Which settings Digital
 * Foundry keeps returning to is a real fact about their coverage; what a
 * setting "typically costs" is not something this data can support.
 */
export const PcSettingsFrequency = z.object({
  name: z.string(),
  /** How many reviews discussed it. */
  gameCount: z.number().default(0),
  /** How many of those actually stated a percentage cost. */
  withStatedCost: z.number().default(0),
});
export type PcSettingsFrequency = z.infer<typeof PcSettingsFrequency>;

export const PcSettingsIndexResponse = z.object({
  rows: z.array(PcSettingsRow).default([]),
  /** Most-discussed settings first. */
  commonSettings: z.array(PcSettingsFrequency).default([]),
  reviewCount: z.number().default(0),
  analysedCount: z.number().default(0),
  libraryCount: z.number().default(0),
  /**
   * Stated-figure coverage, surfaced for the same reason the comparison
   * ledger surfaces it: a table full of blanks should say that blanks are
   * the normal case rather than looking like a loading failure.
   */
  coverage: z
    .object({
      totalSettings: z.number().default(0),
      withStatedCost: z.number().default(0),
      withRecommendation: z.number().default(0),
    })
    .default({ totalSettings: 0, withStatedCost: 0, withRecommendation: 0 }),
});
export type PcSettingsIndexResponse = z.infer<typeof PcSettingsIndexResponse>;
