import { z } from "zod";

/**
 * Hardware reviews, read across the corpus.
 *
 * Around 8% of a real library is hardware - graphics cards, CPUs, handhelds,
 * displays - and until the taxonomy gained a `hardware_review` type all of it
 * classified as "other" and appeared in no view at all. "What did they
 * conclude about the 9070 GRE" had no answer here despite the review being
 * downloaded and analysed.
 *
 * Products are listed per review rather than merged into a catalogue. Two
 * reviews of the same card months apart are two verdicts at two points in
 * time, and collapsing them into one entry would silently pick a winner
 * between them.
 */
export const HardwareProductEntry = z.object({
  name: z.string(),
  /** GPU, CPU, handheld, display - as the review described it. */
  productClass: z.string().nullish(),
  verdict: z.string().nullish(),
  timestampSeconds: z.number().nullish(),
});
export type HardwareProductEntry = z.infer<typeof HardwareProductEntry>;

export const HardwareRow = z.object({
  contentKey: z.string(),
  title: z.string(),
  publishedDate: z.coerce.date(),
  products: z.array(HardwareProductEntry).default([]),
  verdict: z.string().nullish(),
  /**
   * Titles used as benchmarks.
   *
   * Labelled as tests wherever shown. These games are instruments in a
   * hardware review, and presenting them as subjects would imply the archive
   * holds coverage of them that it does not.
   */
  gamesTested: z.array(z.string()).default([]),
  knownIssues: z.array(z.string()).default([]),
  hasArticle: z.boolean().default(false),
  usedTranscript: z.boolean().default(false),
});
export type HardwareRow = z.infer<typeof HardwareRow>;

export const HardwareIndexResponse = z.object({
  rows: z.array(HardwareRow).default([]),
  /** Product classes present, so the filter only offers what exists. */
  classesPresent: z.array(z.string()).default([]),
  reviewCount: z.number().default(0),
  analysedCount: z.number().default(0),
  libraryCount: z.number().default(0),
});
export type HardwareIndexResponse = z.infer<typeof HardwareIndexResponse>;
