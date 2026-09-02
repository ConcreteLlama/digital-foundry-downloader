import { z } from "zod";

/**
 * Schemas describing what the model is asked to return, as distinct from
 * what gets stored.
 *
 * Separate from the storage schemas in df-downloader-common's
 * ai-analysis.ts for a concrete reason rather than tidiness: the API's
 * structured-output mode compiles a schema to strict JSON Schema, which
 * requires every property to be listed in `required` and forbids
 * additional properties. Optional fields and zod defaults do not survive
 * that faithfully. So everything here is **required and explicitly
 * nullable** - "the model must answer this field, and null is a legitimate
 * answer" - which is the wanted semantics anyway: an unstated number
 * should be an explicit null, not a quietly absent key.
 *
 * ## Why the analysis is split across two calls
 *
 * Structured-output mode rejects a schema containing more than 16
 * union-typed parameters, and every nullable field counts as one. A single
 * schema covering the universal fields plus all three per-type payloads
 * came to 26 and was refused outright (HTTP 400, "too many parameters with
 * union types"). Dropping nullability to fit would have meant giving up
 * the "leave it null rather than guess" discipline that makes this data
 * worth storing, so the work is split instead:
 *
 *   1. WireOverview      - classify, summarise, tag. 2 union params.
 *   2. one of the below  - extract structured data for that type only.
 *
 * This is also just a better shape: a Q+A never has a settings-table
 * schema compiled for it, and the second call is skipped entirely for the
 * types that carry no structured data.
 */

const nullableString = () => z.string().nullable();
const nullableNumber = () => z.number().nullable();

export const WireContentType = z.enum([
  "platform_tech_review",
  "pc_review_settings",
  "hands_on_preview",
  "hardware_review",
  "tech_explainer",
  "interview",
  "qa_roundtable",
  "news_discussion",
  "roundup_list",
  "other",
]);
export type WireContentType = z.infer<typeof WireContentType>;

export const WireTag = z.object({
  tag: z.string(),
  confidence: z.number().min(0).max(1),
});

/**
 * First call: what kind of video is this, what does it say, how would you
 * tag it.
 *
 * Universal - runs for every content type, and is the only call made for
 * the types that carry no reliable structured data.
 */
export const WireOverview = z.object({
  contentType: WireContentType,
  contentTypeConfidence: z.number().min(0).max(1),
  /**
   * The single game this is about, or null when it is about none.
   *
   * Asked for on the first call so every content type can answer it, not
   * just the few with a structured extraction - which is what previously
   * made a preview or a Switch 2 port analysis impossible to file.
   */
  primaryGame: nullableString(),
  /**
   * Every game meaningfully covered, including primaryGame.
   *
   * A discussion show has no primary game but covers several; this is how
   * those still surface under each one.
   */
  games: z.array(z.string()),
  summary: nullableString(),
  /**
   * Nullable on purpose, and the prompt says so explicitly: hands-on
   * previews routinely decline to reach a verdict ("too early to judge"),
   * and manufacturing one would invent certainty the presenters
   * themselves disclaimed.
   */
  conclusion: nullableString(),
  tags: z.array(WireTag),
});
export type WireOverview = z.infer<typeof WireOverview>;

/** Tag-only response, for content with neither a transcript nor an article. */
export const WireTagOnly = z.object({
  contentType: WireContentType,
  contentTypeConfidence: z.number().min(0).max(1),
  /**
   * The single game this is about, or null when it is about none.
   *
   * Asked for on the first call so every content type can answer it, not
   * just the few with a structured extraction - which is what previously
   * made a preview or a Switch 2 port analysis impossible to file.
   */
  primaryGame: nullableString(),
  /**
   * Every game meaningfully covered, including primaryGame.
   *
   * A discussion show has no primary game but covers several; this is how
   * those still surface under each one.
   */
  games: z.array(z.string()),
  tags: z.array(WireTag),
});
export type WireTagOnly = z.infer<typeof WireTagOnly>;

export const WirePlatformMode = z.object({
  label: z.string(),
  resolution: nullableString(),
  fpsTarget: nullableNumber(),
  fpsMeasuredAvg: nullableNumber(),
  notes: nullableString(),
  /**
   * A span copied verbatim out of the transcript, or null if none exists.
   *
   * Never a timestamp: the model is not asked where something is, only to
   * cite it. Locating the citation is this side's job, which is what makes
   * a wrong time impossible rather than merely unlikely.
   */
  quote: nullableString(),
});

export const WirePlatform = z.object({
  platform: z.string(),
  modes: z.array(WirePlatformMode),
});

export const WireKnownIssue = z.object({
  issue: z.string(),
  /**
   * A span copied verbatim out of the transcript, or null if none exists.
   *
   * Never a timestamp: the model is not asked where something is, only to
   * cite it. Locating the citation is this side's job, which is what makes
   * a wrong time impossible rather than merely unlikely.
   */
  quote: nullableString(),
});



export const WireSetting = z.object({
  name: z.string(),
  levelsTested: z.array(z.string()),
  perfDeltaPct: nullableNumber(),
  consoleEquivalent: nullableString(),
  recommendation: nullableString(),
  /**
   * A span copied verbatim out of the transcript, or null if none exists.
   *
   * Never a timestamp: the model is not asked where something is, only to
   * cite it. Locating the citation is this side's job, which is what makes
   * a wrong time impossible rather than merely unlikely.
   */
  quote: nullableString(),
});

/**
 * Second call, pc_review_settings branch. 13 union params - the largest of
 * the three, and the reason the 16 limit is worth keeping in mind before
 * adding fields here. Adding the per-setting quote took it from 12 to 13,
 * so there are three left.
 *
 * The optimised-settings result is flattened rather than nested because
 * nesting it bought nothing and the flat form is one fewer object for the
 * model to get wrong; analyse.ts reassembles it.
 */
export const WirePcReviewSettings = z.object({
  game: nullableString(),
  engine: nullableString(),
  verdict: nullableString(),
  bottleneckType: nullableString(),
  bottleneckDetail: nullableString(),
  settings: z.array(WireSetting),
  optimisedTestSystem: nullableString(),
  optimisedFpsBefore: nullableNumber(),
  optimisedFpsAfter: nullableNumber(),
  optimisedGainPct: nullableNumber(),
});
export type WirePcReviewSettings = z.infer<typeof WirePcReviewSettings>;

export const WireQaSegment = z.object({
  topic: z.string(),
  /** The game this item is about, or null when it is not about one. */
  game: nullableString(),
  summary: nullableString(),
  conclusion: nullableString(),
  /**
   * A span copied verbatim out of the transcript, or null if none exists.
   *
   * Never a timestamp: the model is not asked where something is, only to
   * cite it. Locating the citation is this side's job, which is what makes
   * a wrong time impossible rather than merely unlikely.
   */
  quote: nullableString(),
});

/**
 * Second call, platform_tech_review branch. 10 union params.
 *
 * One schema where there were two. The face-off and single-platform variants
 * held identical fields apart from `changeSummary`, so the merged type simply
 * always offers it - a face-off leaves it null, which costs one parameter and
 * removes a classification decision that was wrong nine times out of twelve.
 */
export const WirePlatformTechReview = z.object({
  game: nullableString(),
  developer: nullableString(),
  platforms: z.array(WirePlatform),
  /** What changed against a previous version, patch or platform. Null when nothing did. */
  changeSummary: nullableString(),
  knownIssues: z.array(WireKnownIssue),
  recommendation: nullableString(),
});
export type WirePlatformTechReview = z.infer<typeof WirePlatformTechReview>;

export const WireHardwareProduct = z.object({
  name: z.string(),
  productClass: nullableString(),
  verdict: nullableString(),
  /** A span copied verbatim out of the transcript, or null if none exists. */
  quote: nullableString(),
});

/** Second call, hardware_review branch. */
export const WireHardwareReview = z.object({
  products: z.array(WireHardwareProduct),
  /** Titles used as benchmarks - instruments, not the subject. */
  gamesTested: z.array(z.string()),
  verdict: nullableString(),
  knownIssues: z.array(WireKnownIssue),
});
export type WireHardwareReview = z.infer<typeof WireHardwareReview>;

export const WireObservation = z.object({
  observation: z.string(),
  /** A span copied verbatim out of the transcript, or null if none exists. */
  quote: nullableString(),
});

/** Second call, hands_on_preview branch. No numbers table by design. */
export const WirePreview = z.object({
  game: nullableString(),
  platforms: z.array(z.string()),
  buildState: nullableString(),
  observations: z.array(WireObservation),
  caveats: nullableString(),
});
export type WirePreview = z.infer<typeof WirePreview>;

/** Second call, qa_roundtable branch. 3 union params. */
export const WireQaSegments = z.object({
  segments: z.array(WireQaSegment),
});
export type WireQaSegments = z.infer<typeof WireQaSegments>;

/**
 * The two halves of the overview, for engines that do better with fewer jobs
 * per call.
 *
 * Measured back-to-back on the same six items, same server, same prompts.
 * Asked to classify, summarise and tag in one call, a local model left the
 * conclusion empty on four of six and wrote 509 characters of summary for a
 * Q+A - the most multi-topic content there is. Split across two calls: 1,484
 * characters and a 681-character conclusion, with the summary longer on five
 * of the six. Classification was what crowded the others out.
 *
 * Replicated across three runs: the split call produced a conclusion in 17
 * of 18 item-observations, the combined call in 5 of 12. Local output varies
 * noticeably run to run at temperature 0, so treat any single figure here as
 * indicative rather than exact - the direction replicates, the magnitudes
 * move.
 *
 * Games stay with the summary rather than the classification, deliberately.
 * Moving them to a transcript-free call produced a confidently wrong answer -
 * "Halo: Combat Evolved" for a video about Halo: Campaign Evolved, a title
 * that appears nowhere in any source. Identifying a work needs corroboration;
 * classifying one does not.
 */

/** Phase one: what kind of video this is. Needs no transcript. */
export const WireClassification = WireOverview.pick({
  contentType: true,
  contentTypeConfidence: true,
});
export type WireClassification = z.infer<typeof WireClassification>;

/** Phase two: everything that genuinely needs the transcript. */
export const WireSummary = WireOverview.pick({
  primaryGame: true,
  games: true,
  summary: true,
  conclusion: true,
  tags: true,
});
export type WireSummary = z.infer<typeof WireSummary>;
