import { z } from "zod";

/**
 * The Claude models this feature can run on.
 *
 * Deliberately the bare model IDs with no date suffix - those are the
 * complete, current identifiers. Appending a date (the shape older
 * snapshots used, e.g. "claude-haiku-4-5-20251001") is rejected by the API.
 *
 * Ordered cheapest-first, which is also recommendation order and the order
 * the settings form presents - please don't sort it alphabetically. Haiku
 * leads because it is genuinely the right default here, not merely the
 * cheap option: measured against real Digital Foundry transcripts it
 * produced correct structured extractions, used null properly for numbers
 * the presenter never stated, and cost roughly a tenth of Sonnet for the
 * same work (see docs/AI_CONTENT_ANALYSIS_PLAN.md for the measurements).
 */
export const AiAnalysisModel = z.enum([
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-fable-5",
]);
export type AiAnalysisModel = z.infer<typeof AiAnalysisModel>;

/**
 * How hard the model is allowed to think before answering.
 *
 * Maps to the API's `output_config.effort`. Not universally supported -
 * see AiAnalysisModelCapabilities: Haiku 4.5 predates the parameter and
 * *errors* if it is sent, so the setting is hidden rather than merely
 * ignored when Haiku is selected.
 */
export const AiAnalysisEffort = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type AiAnalysisEffort = z.infer<typeof AiAnalysisEffort>;

/**
 * Per-model API differences this feature has to respect.
 *
 * These are hard API constraints, not preferences - sending an unsupported
 * parameter is a 400, not a silently ignored field, so both the request
 * builder and the settings form read from here rather than each carrying
 * their own assumptions.
 *
 * `pricing` is USD per million tokens, used for the cost estimate shown
 * before a run. It is a real number from Anthropic's published pricing
 * rather than a guess, but it is a *cached* number - if an estimate looks
 * consistently wrong, check the current rates before assuming the token
 * counting is at fault.
 */
export type AiAnalysisModelCapability = {
  label: string;
  /** Whether `output_config.effort` may be sent at all. */
  supportsEffort: boolean;
  /**
   * Whether extended thinking can be turned off.
   *
   * Fable 5 always thinks and rejects `{type: "disabled"}` outright. This
   * matters for cost: thinking tokens bill as output tokens, which is the
   * single biggest driver of the Haiku/Sonnet price gap measured during
   * this feature's investigation.
   */
  canDisableThinking: boolean;
  /** Whether the model takes adaptive thinking (`{type: "adaptive"}`) at all. */
  supportsThinking: boolean;
  pricing: { inputPerMTok: number; outputPerMTok: number };
};

export const AiAnalysisModelCapabilities: Record<AiAnalysisModel, AiAnalysisModelCapability> = {
  "claude-haiku-4-5": {
    label: "Haiku 4.5 - fastest and cheapest (recommended)",
    // Predates output_config.effort entirely; sending it is an error.
    supportsEffort: false,
    supportsThinking: false,
    canDisableThinking: true,
    pricing: { inputPerMTok: 1, outputPerMTok: 5 },
  },
  "claude-sonnet-5": {
    label: "Sonnet 5 - more careful, several times the cost",
    supportsEffort: true,
    supportsThinking: true,
    canDisableThinking: true,
    pricing: { inputPerMTok: 2, outputPerMTok: 10 },
  },
  "claude-opus-5": {
    label: "Opus 5 - most capable of the general models",
    supportsEffort: true,
    supportsThinking: true,
    canDisableThinking: true,
    pricing: { inputPerMTok: 5, outputPerMTok: 25 },
  },
  "claude-fable-5": {
    label: "Fable 5 - most capable overall, most expensive",
    supportsEffort: true,
    supportsThinking: true,
    // Thinking is always on for Fable 5 - {type:"disabled"} is a 400.
    canDisableThinking: false,
    pricing: { inputPerMTok: 10, outputPerMTok: 50 },
  },
};

/**
 * When analysis runs automatically, if at all.
 *
 * Mirrors AutomaticSubtitlesMode deliberately - the same "this costs real
 * time/money, don't hold the download open for it" argument applies, and
 * there is no reason for two settings that mean the same thing to be
 * worded differently.
 */
export const AutomaticAiAnalysisMode = z
  .enum(["off", "during_download", "after_download"])
  .describe(
    "Analysis costs a few pence per video and needs a transcript, so you may prefer the download to finish first - or to only ever trigger it yourself, per item."
  );
export type AutomaticAiAnalysisMode = z.infer<typeof AutomaticAiAnalysisMode>;

/**
 * Whether inferred tags are written straight onto the content or held for
 * review.
 *
 * Defaults to "auto_apply" - confirming each tag by hand is friction that
 * buys little here, since applying a tag is trivially reversible: every
 * suggestion is kept on the analysis record, and removing one takes it
 * back off the content. "suggest" remains for anyone who would rather
 * approve each one before it can affect a filter.
 */
export const AiTagApplyMode = z
  .enum(["suggest", "auto_apply"])
  .describe(
    "Applying tags automatically is the quicker default and easy to undo - you can remove any tag from the analysis afterwards. Holding them for review is available if you would rather approve each one before it can affect a filter."
  );
export type AiTagApplyMode = z.infer<typeof AiTagApplyMode>;

export const AiTaggingConfig = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe(
      "Suggest tags for your content. This is the one part of analysis that does not need a transcript - a title and description alone are enough to infer something useful, so it works for everything in your library, not just what you have downloaded. Tags inferred from a transcript are more specific and more reliable than ones inferred from a title alone, and each suggestion records which it was."
    ),
  applyMode: AiTagApplyMode.default("auto_apply"),
  useTranscriptWhenAvailable: z
    .boolean()
    .default(true)
    .describe(
      "Use the transcript for tagging when one exists, rather than just the title and description. Better tags, but it costs more per item because the whole transcript is sent."
    ),
});
export type AiTaggingConfig = z.infer<typeof AiTaggingConfig>;

export const AiAnalysisFeaturesConfig = z.object({
  summary: z
    .boolean()
    .default(true)
    .describe("Write a detailed summary and a separate verdict for each analysed video."),
  structuredData: z
    .boolean()
    .default(true)
    .describe(
      "Pull out the hard numbers as structured data where the content supports it - per-platform resolutions and frame rates for console comparisons, the settings table for PC reviews. Content that does not suit this (hands-on previews, Q+A discussions) is summarised only."
    ),
  tagging: AiTaggingConfig.prefault({}),
});
export type AiAnalysisFeaturesConfig = z.infer<typeof AiAnalysisFeaturesConfig>;

/**
 * Optional extra instructions appended to the built-in prompts.
 *
 * Deliberately additive rather than a replacement. The structured-data
 * extraction depends on the model returning output that matches a schema;
 * letting a custom prompt replace the built-in one entirely would break
 * parsing in ways that are hard to diagnose from the outside. Appending is
 * useful ("I care about VRR behaviour", "always mention Series S") without
 * putting the schema at risk.
 */
export const AiPromptAdditionsConfig = z.object({
  summary: z
    .string()
    .optional()
    .describe("Extra instructions added to the summary prompt, e.g. what you especially want mentioned."),
  tagging: z
    .string()
    .optional()
    .describe(
      "Extra instructions added to the tagging prompt - the place to describe your own tagging conventions, so suggestions match the tags you already use."
    ),
});
export type AiPromptAdditionsConfig = z.infer<typeof AiPromptAdditionsConfig>;

export const AiAnalysisConfig = z.object({
  enabled: z.boolean().default(false).describe("Turn AI content analysis on."),
  apiKey: z
    .string()
    .optional()
    .describe("Your Anthropic API key, created at https://console.anthropic.com/settings/keys."),
  model: AiAnalysisModel.default("claude-haiku-4-5").describe(
    "Which Claude model to analyse with. Haiku is the recommended default - in testing it extracted settings tables and per-platform numbers correctly at around a tenth of the cost of the larger models."
  ),
  /**
   * Left optional rather than defaulted: "unset" has to stay
   * distinguishable from an explicit choice, because the parameter cannot
   * be sent at all on Haiku (see AiAnalysisModelCapabilities). A default
   * here would mean silently sending an invalid request the moment someone
   * switched model.
   */
  effort: AiAnalysisEffort.optional().describe(
    "How long the model may think before answering. Higher is more careful and more expensive. Not available on Haiku, which does not support this setting."
  ),
  automaticGeneration: AutomaticAiAnalysisMode.default("off"),
  /**
   * A hard ceiling on transcript size, in characters.
   *
   * Exists because cost scales with transcript length and a two-hour DF
   * Direct is a genuinely large input. Characters rather than tokens
   * because it is checked before any API call is made - the point is to
   * refuse to spend the money, which means deciding without spending a
   * token-counting round trip first.
   */
  maxTranscriptChars: z
    .number()
    .int()
    .min(1000)
    .default(400000)
    .describe(
      "Longest transcript to analyse, in characters. Anything longer is skipped rather than analysed at cost. 400,000 is comfortably more than a two-hour episode."
    ),
  features: AiAnalysisFeaturesConfig.prefault({}),
  promptAdditions: AiPromptAdditionsConfig.optional(),
});
export type AiAnalysisConfig = z.infer<typeof AiAnalysisConfig>;
export const AiAnalysisConfigKey = "aiAnalysis";

export const AiAnalysisConfigUtils = {
  capabilities: (model: AiAnalysisModel) => AiAnalysisModelCapabilities[model],
  /**
   * Whether the configuration is complete enough to actually make a call.
   * `enabled` alone isn't enough - without a key every run would fail at
   * the first request, so the UI and the service both gate on this.
   */
  isUsable: (config?: AiAnalysisConfig): boolean =>
    Boolean(config?.enabled && config.apiKey && config.apiKey.trim().length > 0),
  /**
   * The effort value that may actually be sent for this config, or
   * undefined when the parameter must be omitted entirely.
   */
  resolveEffort: (config: AiAnalysisConfig): AiAnalysisEffort | undefined =>
    AiAnalysisModelCapabilities[config.model].supportsEffort ? config.effort : undefined,
};
