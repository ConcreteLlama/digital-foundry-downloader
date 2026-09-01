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

/**
 * Which grounding sources an analysis may read.
 *
 * Separate from the feature switches because these are about what the run is
 * allowed to look at, not what it produces - and the difference is money and
 * accuracy rather than taste. Turning the transcript off makes every run
 * dramatically cheaper (a two-hour Direct is most of the input tokens) at the
 * cost of the summary, the structured data and the jump-to timestamps.
 *
 * Both default on: the honest default is to use what you already have.
 */
export const AiAnalysisSourcesConfig = z.object({
  transcript: z
    .boolean()
    .default(true)
    .describe(
      "Read the video's subtitles when it has them. This is what makes a summary, a verdict and the structured breakdown possible, and what anchors each finding to the moment it was said - but it is also nearly all of what a run costs."
    ),
  article: z
    .boolean()
    .default(true)
    .describe(
      "Read Digital Foundry's written article when one is matched. Written rather than transcribed, so product names and figures in it are correct where speech-to-text garbles them."
    ),
});
export type AiAnalysisSourcesConfig = z.infer<typeof AiAnalysisSourcesConfig>;

/**
 * Local engines that have actually been measured against the stored corpus.
 *
 * A short list on purpose. Any GGUF will load, but "it runs" and "it fills
 * this schema without inventing numbers" are different claims, and only these
 * have been checked - see docs/LOCAL_AI_ANALYSIS_SPIKE.md.
 */
export const AiLocalModel = z.enum(["qwen3.5-9b", "qwen3.5-4b"]);
export type AiLocalModel = z.infer<typeof AiLocalModel>;

export type AiLocalModelInfo = {
  label: string;
  /** GGUF download, fetched on first use the way Whisper models are. */
  url: string;
  fileName: string;
  approxBytes: number;
  notes: string;
};

export const AiLocalModels: Record<AiLocalModel, AiLocalModelInfo> = {
  "qwen3.5-9b": {
    label: "Qwen3.5 9B (recommended)",
    url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-UD-Q4_K_XL.gguf",
    fileName: "Qwen3.5-9B-UD-Q4_K_XL.gguf",
    approxBytes: 5_966_095_584,
    notes:
      "Schema-valid on every measured call, correct on every classification, and invented no numbers. The default for good reason.",
  },
  "qwen3.5-4b": {
    label: "Qwen3.5 4B (constrained hardware)",
    url: "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-UD-Q4_K_XL.gguf",
    fileName: "Qwen3.5-4B-UD-Q4_K_XL.gguf",
    approxBytes: 2_912_109_728,
    notes:
      "Half the size and still classifies correctly, but it fabricated a figure once and hit a repetition loop on one item - so it is an opt-in for small machines rather than a default.",
  },
};

export const AiLocalProviderConfig = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe("Analyse on this machine instead of paying an API. Slower, but it costs nothing to run."),
  model: AiLocalModel.default("qwen3.5-9b").describe(
    "Which local model to analyse with. The 9B is recommended - the 4B is faster but has been seen to invent a figure."
  ),
  /**
   * Left optional so it can follow the Whisper models directory by default -
   * the same "downloaded once, kept" story, in the same place.
   */
  modelDir: z
    .string()
    .optional()
    .describe("Where to keep downloaded models. Defaults to alongside the Whisper models."),
  /**
   * Point at a llama-server that is already running instead of managing one.
   *
   * For anyone who would rather run inference on a different machine, or who
   * already has a server up - and the only way to test this without a bundled
   * binary.
   */
  serverUrl: z
    .string()
    .optional()
    .describe("Use a llama-server that is already running, e.g. http://localhost:8080. Leave blank to run one here."),
  /**
   * Where the llama-server binary is, when it is not on the PATH.
   *
   * The Docker image builds it and sets LLAMA_SERVER_BINARY, so this only
   * matters for a bare install - the same arrangement Whisper already has.
   */
  binaryPath: z
    .string()
    .optional()
    .describe("Path to llama-server, if it is not on the PATH. Not needed in the Docker image."),
  port: z
    .number()
    .int()
    .min(1024)
    .max(65535)
    .default(8127)
    .describe("Port for the analysis server this app runs. Only change it if something else uses this one."),
  /**
   * How long to keep the model loaded after the last analysis.
   *
   * Loading costs seconds and several gigabytes of RAM, so holding it across a
   * backfill is worth it while dropping it afterwards keeps that memory
   * available to everything else on the machine.
   */
  idleShutdownSeconds: z
    .number()
    .int()
    .min(0)
    .default(300)
    .describe("Seconds to keep the model loaded after the last analysis. 0 unloads it immediately."),
  threads: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("CPU threads to use. Defaults to leaving a couple free for everything else on the machine."),
  contextSize: z
    .number()
    .int()
    .min(4096)
    .default(32768)
    .describe("How much text the model can consider at once. A long transcript needs a large window."),
  gpuLayers: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Layers to offload to a GPU, if there is one. Leave blank to offload as many as fit."),
});
export type AiLocalProviderConfig = z.infer<typeof AiLocalProviderConfig>;

/** Which engine answers. Both can be configured; this is the default pick. */
export const AiProviderId = z.enum(["anthropic", "local"]);
export type AiProviderId = z.infer<typeof AiProviderId>;

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
   * The default sources a run may read. Both the per-item analyse action and
   * a bulk run start from these and can override them for that run only.
   */
  sources: AiAnalysisSourcesConfig.prefault({}),
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
  /**
   * The local engine. Additive rather than a restructure: the Anthropic
   * settings stay exactly where existing installs already have them, so
   * nothing needs migrating.
   */
  local: AiLocalProviderConfig.prefault({}),
  /**
   * Which engine to use when nothing says otherwise - unattended runs, and
   * the pre-selected option wherever a choice is offered.
   */
  defaultProvider: AiProviderId.default("anthropic").describe(
    "Which engine to analyse with by default. You can still pick per run when both are set up."
  ),
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
  isUsable: (config?: AiAnalysisConfig): boolean => AiAnalysisConfigUtils.usableProviders(config).length > 0,

  /**
   * Why one engine cannot be used, or undefined when it can.
   *
   * A reason rather than a boolean so the UI can say what to go and fix,
   * instead of presenting an option that silently does nothing.
   */
  providerUnusableReason: (config: AiAnalysisConfig | undefined, provider: AiProviderId): string | undefined => {
    if (!config?.enabled) {
      return "AI analysis is turned off";
    }
    if (provider === "anthropic") {
      return config.apiKey && config.apiKey.trim().length > 0 ? undefined : "No Anthropic API key has been set";
    }
    /*
     * Nothing else to check: the app can download the model and run a server
     * itself, so "enabled" really is enough. Pointing at an existing server is
     * an option rather than a requirement.
     */
    return config.local?.enabled ? undefined : "Local analysis is turned off";
  },

  /** Every engine that could answer right now. */
  usableProviders: (config?: AiAnalysisConfig): AiProviderId[] =>
    (["anthropic", "local"] as AiProviderId[]).filter(
      (provider) => AiAnalysisConfigUtils.providerUnusableReason(config, provider) === undefined
    ),

  /**
   * Which engine a run should use.
   *
   * A request wins if it can be honoured; otherwise the configured default,
   * and failing that whatever is usable. Falling back rather than failing is
   * deliberate for unattended work - an auto-analysis should not stop because
   * the preferred engine is unavailable when another one is right there.
   */
  resolveProvider: (config: AiAnalysisConfig, requested?: AiProviderId): AiProviderId | undefined => {
    const usable = AiAnalysisConfigUtils.usableProviders(config);
    if (requested && usable.includes(requested)) {
      return requested;
    }
    if (usable.includes(config.defaultProvider)) {
      return config.defaultProvider;
    }
    return usable[0];
  },
  /**
   * The effort value that may actually be sent for this config, or
   * undefined when the parameter must be omitted entirely.
   */
  resolveEffort: (config: AiAnalysisConfig): AiAnalysisEffort | undefined =>
    AiAnalysisModelCapabilities[config.model].supportsEffort ? config.effort : undefined,
};
