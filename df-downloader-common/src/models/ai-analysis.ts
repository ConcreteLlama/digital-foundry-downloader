import { z } from "zod";
import { AiAnalysisModel } from "../config/ai-analysis-config.js";

/**
 * What kind of video this is, which decides what structured data (if any)
 * is worth extracting from it.
 *
 * A single fixed schema does not fit Digital Foundry's output - a console
 * face-off and a Q+A roundtable have essentially nothing in common
 * structurally - so the pipeline classifies first and dispatches second.
 * These five are the types confirmed to exist from a real sample of the
 * library; `other` is the deliberate escape hatch for everything not yet
 * characterised (retrospectives, interviews, hardware reviews), which gets
 * summary treatment rather than a forced fit into a schema that doesn't
 * describe it.
 */
export const AiContentType = z.enum([
  "console_comparison",
  "pc_review_settings",
  "hands_on_preview",
  "qa_roundtable",
  "other",
]);
export type AiContentType = z.infer<typeof AiContentType>;

export const AiContentTypeLabels: Record<AiContentType, string> = {
  console_comparison: "Console comparison",
  pc_review_settings: "PC review & optimised settings",
  hands_on_preview: "Hands-on preview",
  qa_roundtable: "Q+A / discussion",
  other: "Other",
};

/**
 * What the model was actually looking at when it produced a given output.
 *
 * Carried through to the UI rather than kept as debug detail: a tag
 * inferred from a title alone is a materially weaker claim than one drawn
 * from a full transcript, and the person deciding whether to trust it
 * needs to know which they are looking at. Recording the evidence is also
 * what makes a later re-run worth doing - an item analysed from title and
 * description only is a candidate for re-analysis once a transcript
 * exists, and without this field there is no way to tell which those are.
 */
export const AiEvidenceSource = z.enum(["title", "description", "transcript", "article"]);
export type AiEvidenceSource = z.infer<typeof AiEvidenceSource>;

export const AiEvidenceSourceLabels: Record<AiEvidenceSource, string> = {
  title: "Title",
  description: "Description",
  transcript: "Transcript",
  article: "DF article",
};

/**
 * One suggested tag, with the evidence it came from.
 *
 * `status` exists because tags drive real filtering here, including
 * auto-download exclusion rules - so a suggestion is held in a reviewable
 * state by default rather than written straight into the content's tag
 * list. A rejected tag is kept rather than deleted, so the same wrong
 * suggestion isn't re-offered on every subsequent run.
 */
export const AiTagStatus = z.enum(["suggested", "accepted", "rejected"]);
export type AiTagStatus = z.infer<typeof AiTagStatus>;

export const AiTagSuggestion = z.object({
  tag: z.string(),
  status: AiTagStatus.default("suggested"),
  /** What the model saw in order to propose this tag. Never empty. */
  basis: z.array(AiEvidenceSource).default([]),
  /**
   * The model's own confidence, 0-1, when it offered one. Advisory only -
   * a self-reported number from the thing being judged, useful for
   * ordering suggestions but not for deciding correctness.
   */
  confidence: z.number().min(0).max(1).optional(),
});
export type AiTagSuggestion = z.infer<typeof AiTagSuggestion>;

/** One display/performance mode of one platform, in a console comparison. */
export const AiPlatformMode = z.object({
  label: z.string(),
  resolution: z.string().nullish(),
  fpsTarget: z.number().nullish(),
  fpsMeasuredAvg: z.number().nullish(),
  notes: z.string().nullish(),
});
export type AiPlatformMode = z.infer<typeof AiPlatformMode>;

export const AiPlatformComparison = z.object({
  platform: z.string(),
  modes: z.array(AiPlatformMode).default([]),
});
export type AiPlatformComparison = z.infer<typeof AiPlatformComparison>;

/**
 * Console face-off data.
 *
 * Every numeric field is nullable on purpose, and the extraction prompt is
 * explicit that unstated numbers must be left null rather than guessed.
 * Presenters routinely describe a difference qualitatively without ever
 * saying a number, and a fabricated-but-plausible figure is far worse here
 * than an honest gap - the whole point of this data is that it can be
 * trusted enough to compare against.
 */
export const AiConsoleComparisonData = z.object({
  contentType: z.literal("console_comparison"),
  game: z.string().nullish(),
  developer: z.string().nullish(),
  platforms: z.array(AiPlatformComparison).default([]),
  knownIssues: z.array(z.string()).default([]),
  recommendation: z.string().nullish(),
});
export type AiConsoleComparisonData = z.infer<typeof AiConsoleComparisonData>;

export const AiSettingEntry = z.object({
  name: z.string(),
  levelsTested: z.array(z.string()).default([]),
  /** Performance cost of this setting, as a percentage. Null when never stated numerically. */
  perfDeltaPct: z.number().nullish(),
  consoleEquivalent: z.string().nullish(),
  recommendation: z.string().nullish(),
});
export type AiSettingEntry = z.infer<typeof AiSettingEntry>;

export const AiOptimisedSettingsResult = z.object({
  testSystem: z.string().nullish(),
  fpsBefore: z.number().nullish(),
  fpsAfter: z.number().nullish(),
  gainPct: z.number().nullish(),
});
export type AiOptimisedSettingsResult = z.infer<typeof AiOptimisedSettingsResult>;

export const AiPcReviewSettingsData = z.object({
  contentType: z.literal("pc_review_settings"),
  game: z.string().nullish(),
  engine: z.string().nullish(),
  verdict: z.string().nullish(),
  bottleneck: z
    .object({
      type: z.string().nullish(),
      detail: z.string().nullish(),
    })
    .nullish(),
  settings: z.array(AiSettingEntry).default([]),
  optimisedSettingsResult: AiOptimisedSettingsResult.nullish(),
});
export type AiPcReviewSettingsData = z.infer<typeof AiPcReviewSettingsData>;

/**
 * One question/topic within a Q+A or discussion video.
 *
 * Note there is deliberately no "asked by" field. Whisper mangles
 * arbitrary usernames badly and there is no reference vocabulary to snap a
 * garbled handle back to, nor any secondary source in this tool to check
 * it against - so a name here would be confident-looking noise. Omitted
 * rather than populated unreliably.
 */
export const AiQaSegment = z.object({
  topic: z.string(),
  summary: z.string().nullish(),
  conclusion: z.string().nullish(),
});
export type AiQaSegment = z.infer<typeof AiQaSegment>;

export const AiQaRoundtableData = z.object({
  contentType: z.literal("qa_roundtable"),
  segments: z.array(AiQaSegment).default([]),
});
export type AiQaRoundtableData = z.infer<typeof AiQaRoundtableData>;

/**
 * Structured payload, discriminated by content type.
 *
 * Only the two types the source material genuinely supports have a schema.
 * `hands_on_preview` is excluded on purpose: the real data in it is
 * outnumbered by hedged, exploratory opinion, and the premise of the
 * format is that it is too early to say - forcing it into a table would
 * manufacture certainty the presenters explicitly disclaimed.
 */
export const AiStructuredData = z.discriminatedUnion("contentType", [
  AiConsoleComparisonData,
  AiPcReviewSettingsData,
  AiQaRoundtableData,
]);
export type AiStructuredData = z.infer<typeof AiStructuredData>;

/** Token counts and the resulting cost of one run, in USD. */
export const AiAnalysisUsage = z.object({
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  costUsd: z.number().default(0),
});
export type AiAnalysisUsage = z.infer<typeof AiAnalysisUsage>;

/**
 * The stored result of one analysis run.
 *
 * Held as a single blob on the content entry. The flat-file DB has no
 * query story for nested structured data, so there is nothing to gain from
 * shredding this into columns today - see docs/DATABASE_MIGRATION_PLAN.md
 * for where that might change.
 */
export const AiAnalysisResult = z.object({
  analysedAt: z.coerce.date(),
  model: AiAnalysisModel,
  contentType: AiContentType,
  /** The classifier's confidence in `contentType`, 0-1, when it gave one. */
  contentTypeConfidence: z.number().min(0).max(1).optional(),
  summary: z.string().nullish(),
  conclusion: z.string().nullish(),
  structuredData: AiStructuredData.nullish(),
  tags: z.array(AiTagSuggestion).default([]),
  /**
   * Everything the run actually had to work from. The presence or absence
   * of "transcript" here is what the UI reads to explain how well-founded
   * a given result is, so it is required rather than optional.
   */
  evidence: z.array(AiEvidenceSource).default([]),
  usage: AiAnalysisUsage.optional(),
  /**
   * Set when the run produced nothing usable. Kept alongside the result
   * rather than thrown away so a failure is visible in the UI instead of
   * looking like an item that was simply never analysed.
   */
  error: z.string().optional(),
});
export type AiAnalysisResult = z.infer<typeof AiAnalysisResult>;

export const AiAnalysisResultUtils = {
  usedTranscript: (result: AiAnalysisResult): boolean => result.evidence.includes("transcript"),
  /**
   * Whether re-running would plausibly do better than last time. True when
   * the stored result was produced without a transcript - the case that
   * resolves itself once subtitles are generated.
   */
  couldImproveWithTranscript: (result: AiAnalysisResult): boolean =>
    !result.error && !result.evidence.includes("transcript"),
  pendingTags: (result: AiAnalysisResult): AiTagSuggestion[] =>
    result.tags.filter((tag) => tag.status === "suggested"),
  acceptedTags: (result: AiAnalysisResult): string[] =>
    result.tags.filter((tag) => tag.status === "accepted").map((tag) => tag.tag),
};

/**
 * The cheap, list-view summary of a stored analysis.
 *
 * Full results are held one-per-file rather than in the main DB - a single
 * analysis is around 8KB, so covering the whole library would add roughly
 * 23MB to a file that is rewritten in full on every download, availability
 * change and scan. (This codebase already has the object lesson: see the
 * size `completed-pipelines.json` reaches.)
 *
 * That split means a list view cannot afford to read every result to show
 * an "analysed" badge, so this index carries just enough to render one -
 * and stays small enough to hold in memory for the entire archive.
 */
export const AiAnalysisIndexEntry = z.object({
  analysedAt: z.coerce.date(),
  model: AiAnalysisModel,
  contentType: AiContentType,
  /** Whether the stored result records a failure rather than an analysis. */
  hasError: z.boolean().default(false),
  /** Drives the "tags waiting for you" affordance without loading the tags. */
  pendingTagCount: z.number().int().default(0),
  evidence: z.array(AiEvidenceSource).default([]),
});
export type AiAnalysisIndexEntry = z.infer<typeof AiAnalysisIndexEntry>;

export const makeAiAnalysisIndexEntry = (result: AiAnalysisResult): AiAnalysisIndexEntry => ({
  analysedAt: result.analysedAt,
  model: result.model,
  contentType: result.contentType,
  hasError: Boolean(result.error),
  pendingTagCount: result.tags.filter((tag) => tag.status === "suggested").length,
  evidence: result.evidence,
});

/** Request body for triggering analysis by hand from the UI. */
export const AnalyseContentRequest = z.object({
  contentKey: z.string(),
  /** Re-run even when a result already exists. */
  force: z.boolean().default(false),
});
export type AnalyseContentRequest = z.infer<typeof AnalyseContentRequest>;

/**
 * What a run is expected to cost, shown before it starts.
 *
 * `estimated` because output length genuinely cannot be known in advance;
 * input tokens are counted exactly via the API's token-counting endpoint,
 * output is projected from measured runs against real content.
 */
export const AiAnalysisCostEstimate = z.object({
  model: AiAnalysisModel,
  inputTokens: z.number(),
  estimatedOutputTokens: z.number(),
  estimatedCostUsd: z.number(),
  /** True when no transcript was found, so this is the cheaper tags-only path. */
  tagsOnly: z.boolean().default(false),
});
export type AiAnalysisCostEstimate = z.infer<typeof AiAnalysisCostEstimate>;

export const AiTagDecisionRequest = z.object({
  contentKey: z.string(),
  tag: z.string(),
  status: AiTagStatus,
});
export type AiTagDecisionRequest = z.infer<typeof AiTagDecisionRequest>;
