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
  "platform_analysis",
  "pc_review_settings",
  "hands_on_preview",
  "game_retrospective",
  "hardware_review",
  "tech_explainer",
  "interview",
  "qa_roundtable",
  "news_discussion",
  "roundup_list",
  "other",
]);
export type AiContentType = z.infer<typeof AiContentType>;

export const AiContentTypeLabels: Record<AiContentType, string> = {
  console_comparison: "Console comparison",
  platform_analysis: "Platform analysis",
  pc_review_settings: "PC review & optimised settings",
  hands_on_preview: "Hands-on preview",
  game_retrospective: "Retrospective",
  hardware_review: "Hardware review",
  tech_explainer: "Tech explainer",
  interview: "Interview",
  qa_roundtable: "Q+A",
  news_discussion: "News & discussion",
  roundup_list: "Round-up",
  other: "Other",
};

/**
 * Whether a type is inherently about one game, may be, or never is.
 *
 * Drives what the extraction asks for. A type that is always about one game
 * is asked for it directly; one that never is has no primary game to offer,
 * and asking would invite an invented answer. The middle case is real and
 * common - a hardware review is about a GPU, but "Inside 007 First Light" is
 * an engine piece about exactly one game - so those are asked for it and
 * allowed to answer null.
 *
 * Note that "never has a primary game" is not "never mentions games": a DF
 * Direct has no single subject but its segments cover specific titles, and
 * those still belong in `games` so the piece surfaces under each of them.
 */
export const AiContentTypeGameSubject: Record<AiContentType, "single" | "maybe" | "none"> = {
  console_comparison: "single",
  platform_analysis: "single",
  pc_review_settings: "single",
  hands_on_preview: "single",
  game_retrospective: "single",
  hardware_review: "maybe",
  tech_explainer: "maybe",
  interview: "maybe",
  qa_roundtable: "none",
  news_discussion: "none",
  roundup_list: "none",
  other: "maybe",
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
/**
 * Where a finding is stated in the video.
 *
 * `quote` is a span the model copied verbatim out of the transcript it was
 * given; `timestampSeconds` is where that span sits, resolved by locating
 * the quote in the transcript rather than by asking for a number.
 *
 * That indirection is the whole design. Asked for a timestamp directly the
 * model will produce a plausible one, and a jump that lands ninety seconds
 * out looks exactly as confident as a correct one. Asked for a quote it
 * either copied something that exists - in which case the position is a
 * fact, not a guess - or it did not, which is detectable for free and
 * yields an honest null. Measured over two videos and twenty-five
 * findings, every quote returned was found verbatim.
 *
 * Both are nullish: analyses written before this existed have neither, and
 * a finding drawn from the article rather than the speech has a quote that
 * will never locate.
 */
export const AiAnchorFields = {
  quote: z.string().nullish(),
  timestampSeconds: z.number().nullish(),
};

export const AiPlatformMode = z.object({
  label: z.string(),
  resolution: z.string().nullish(),
  fpsTarget: z.number().nullish(),
  fpsMeasuredAvg: z.number().nullish(),
  notes: z.string().nullish(),
  ...AiAnchorFields,
});
export type AiPlatformMode = z.infer<typeof AiPlatformMode>;

export const AiPlatformComparison = z.object({
  platform: z.string(),
  modes: z.array(AiPlatformMode).default([]),
});
export type AiPlatformComparison = z.infer<typeof AiPlatformComparison>;

/**
 * A problem the video calls out, and where it says so.
 *
 * Stored as an object rather than a bare string so it can carry an anchor
 * like every other finding. Records written before that change hold plain
 * strings, so those are lifted into this shape on read - the alternative
 * was a migration for data that is cheap to re-derive.
 */
export const AiKnownIssue = z.preprocess(
  (value) => (typeof value === "string" ? { issue: value } : value),
  z.object({
    issue: z.string(),
    ...AiAnchorFields,
  })
);
export type AiKnownIssue = z.infer<typeof AiKnownIssue>;

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
  knownIssues: z.array(AiKnownIssue).default([]),
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
  ...AiAnchorFields,
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
  /**
   * The game this segment is about, when it is about one.
   *
   * A discussion show has no single subject, but its individual items very
   * often do - a Direct covering a remaster announcement is the only record
   * this tool has of what was said about that game. Without this the piece
   * is invisible under the game entirely.
   */
  game: z.string().nullish(),
  summary: z.string().nullish(),
  conclusion: z.string().nullish(),
  ...AiAnchorFields,
});
export type AiQaSegment = z.infer<typeof AiQaSegment>;

export const AiQaRoundtableData = z.object({
  contentType: z.literal("qa_roundtable"),
  segments: z.array(AiQaSegment).default([]),
});
export type AiQaRoundtableData = z.infer<typeof AiQaRoundtableData>;

/**
 * One game examined on one or more platforms, outside a full face-off.
 *
 * The single largest category in the library and the one that had no schema
 * at all: a Switch 2 port, a PS5 Pro patch, a "have they fixed it yet"
 * revisit. Structurally it is a face-off with fewer platforms, so it reuses
 * the same per-platform shape rather than inventing a parallel one - which
 * also means these can feed the platform comparison view later.
 *
 * `changeSummary` is what makes it distinct: this format is usually about a
 * delta - what a patch altered, how a port differs from the original - and
 * that is the thing a reader wants and a bare mode table cannot express.
 */
export const AiPlatformAnalysisData = z.object({
  contentType: z.literal("platform_analysis"),
  game: z.string().nullish(),
  developer: z.string().nullish(),
  platforms: z.array(AiPlatformComparison).default([]),
  /** What changed relative to a previous version, patch or platform. */
  changeSummary: z.string().nullish(),
  knownIssues: z.array(AiKnownIssue).default([]),
  verdict: z.string().nullish(),
});
export type AiPlatformAnalysisData = z.infer<typeof AiPlatformAnalysisData>;

export const AiHardwareProduct = z.object({
  name: z.string(),
  /** GPU, CPU, handheld, display, laptop - as described, not from a fixed list. */
  productClass: z.string().nullish(),
  verdict: z.string().nullish(),
  ...AiAnchorFields,
});
export type AiHardwareProduct = z.infer<typeof AiHardwareProduct>;

/**
 * A hardware review.
 *
 * `gamesTested` is deliberately separate from the analysis's `games`: the
 * titles benchmarked are instruments, not the subject. A GPU review that
 * happens to test Cyberpunk should not file itself under Cyberpunk as though
 * it were coverage of that game.
 */
export const AiHardwareReviewData = z.object({
  contentType: z.literal("hardware_review"),
  products: z.array(AiHardwareProduct).default([]),
  /** Titles used as benchmarks, which are not what the video is about. */
  gamesTested: z.array(z.string()).default([]),
  verdict: z.string().nullish(),
  knownIssues: z.array(AiKnownIssue).default([]),
});
export type AiHardwareReviewData = z.infer<typeof AiHardwareReviewData>;

/**
 * An early look at something unreleased.
 *
 * Deliberately lighter than the other schemas. The premise of the format is
 * that it is too early to say, and the earlier decision not to give previews
 * a schema at all was right about that - a settings table here would
 * manufacture certainty the presenters explicitly disclaimed. What it was
 * wrong about is the game: a preview is about exactly one, which makes it the
 * easiest thing in the library to file and it was being dropped entirely.
 *
 * So: the game, what was actually shown, and the caveats - no numbers table.
 */
export const AiPreviewData = z.object({
  contentType: z.literal("hands_on_preview"),
  game: z.string().nullish(),
  platforms: z.array(z.string()).default([]),
  /** Preview build, beta, demo, near-final - whatever the video says it saw. */
  buildState: z.string().nullish(),
  observations: z.array(z.object({ observation: z.string(), ...AiAnchorFields })).default([]),
  /** What the presenters said not to conclude from this yet. */
  caveats: z.string().nullish(),
});
export type AiPreviewData = z.infer<typeof AiPreviewData>;

/**
 * A show that moves through unrelated items - a Direct, a showcase reaction.
 *
 * Same shape as a Q+A because structurally it is the same thing: a sequence
 * of topics, each of which may name a game. Kept as its own content type
 * rather than merged so the label can be honest about which format it is.
 */
export const AiNewsDiscussionData = z.object({
  contentType: z.literal("news_discussion"),
  segments: z.array(AiQaSegment).default([]),
});
export type AiNewsDiscussionData = z.infer<typeof AiNewsDiscussionData>;

/** A year-end list or best-of, where every entry is a game with a reason. */
export const AiRoundupData = z.object({
  contentType: z.literal("roundup_list"),
  segments: z.array(AiQaSegment).default([]),
});
export type AiRoundupData = z.infer<typeof AiRoundupData>;

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
  AiPlatformAnalysisData,
  AiPcReviewSettingsData,
  AiPreviewData,
  AiHardwareReviewData,
  AiQaRoundtableData,
  AiNewsDiscussionData,
  AiRoundupData,
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
  /**
   * The single game this content is about, or null when it is about none.
   *
   * Top level rather than inside `structuredData` because grouping should not
   * have to know which content types happen to carry a game. It previously
   * did: only two of the schemas had the field, so a preview or a Switch 2
   * port analysis - unambiguously about one game each - could never appear
   * under it, and adding a content type silently meant "invisible in Games".
   */
  primaryGame: z.string().nullish(),
  /**
   * Every game this content meaningfully covers, including `primaryGame`.
   *
   * Separate from `primaryGame` because plenty of content covers games
   * without being about one. A Direct has no primary game but its segments
   * discuss several, and a year-end round-up is nothing but a list of them -
   * so both belong under each game they cover even though neither has a
   * subject. Benchmarks are deliberately excluded: a GPU review tests games
   * rather than covering them (see AiHardwareReviewData.gamesTested).
   */
  games: z.array(z.string()).default([]),
  structuredData: AiStructuredData.nullish(),
  tags: z.array(AiTagSuggestion).default([]),
  /**
   * Everything the run actually had to work from. The presence or absence
   * of "transcript" here is what the UI reads to explain how well-founded
   * a given result is, so it is required rather than optional.
   */
  evidence: z.array(AiEvidenceSource).default([]),
  /**
   * The Digital Foundry article used as grounding, when one was matched.
   *
   * Stored on the result rather than looked up separately so the UI can
   * credit the source without a second request - and so the record stays
   * truthful if the article is later re-matched or moves: this is what
   * *this* run actually read.
   */
  articleUrl: z.string().optional(),
  articleTitle: z.string().optional(),
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
  /**
   * Carried into the index so grouping and filtering by game never has to
   * open every result file - the whole reason this index exists.
   */
  primaryGame: z.string().nullish(),
  games: z.array(z.string()).default([]),
});
export type AiAnalysisIndexEntry = z.infer<typeof AiAnalysisIndexEntry>;

export const makeAiAnalysisIndexEntry = (result: AiAnalysisResult): AiAnalysisIndexEntry => ({
  analysedAt: result.analysedAt,
  model: result.model,
  contentType: result.contentType,
  hasError: Boolean(result.error),
  pendingTagCount: result.tags.filter((tag) => tag.status === "suggested").length,
  evidence: result.evidence,
  primaryGame: result.primaryGame,
  games: resolveAnalysisGames(result),
});

/**
 * Every game an analysis covers, tolerating records written before the
 * top-level fields existed.
 *
 * Those older results still hold a game inside `structuredData` for the two
 * types that had one, so reading through to it keeps them grouped instead of
 * silently dropping out of the index until they are re-analysed.
 */
export const resolveAnalysisGames = (result: {
  primaryGame?: string | null;
  games?: string[];
  structuredData?: AiStructuredData | null;
}): string[] => {
  const names = [...(result.games ?? [])];
  // Only some payload types carry a game, so this reads through defensively
  // rather than narrowing on contentType - the set of types that have one has
  // already changed once and will again.
  const structuredGame =
    result.structuredData && "game" in result.structuredData ? result.structuredData.game : undefined;
  const fallbacks = [result.primaryGame, structuredGame];
  for (const name of fallbacks) {
    if (name && !names.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      names.push(name);
    }
  }
  return names.filter((name) => Boolean(name?.trim()));
};

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
