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
 * have been checked - see docs/LOCAL_AI_ANALYSIS_SPIKE.md and
 * docs/LOCAL_AI_QUALITY_FINDINGS.md.
 *
 * Deliberately short. Gemma 4 26B-A4B and gpt-oss-20b were both measured
 * against the same corpus and both rejected: Gemma grounds fewer quotes and
 * drops the conclusion on a third of items, and gpt-oss invented a quarter of
 * its quotes and once returned 135 platforms for a four-platform comparison.
 * A model that will not be recommended should not be offered.
 */
export const AiLocalModel = z.enum(["qwen3.5-9b", "qwen3.6-35b-a3b"]);
export type AiLocalModel = z.infer<typeof AiLocalModel>;

export type AiLocalModelInfo = {
  label: string;
  /** GGUF download, fetched on first use the way Whisper models are. */
  url: string;
  fileName: string;
  approxBytes: number;
  notes: string;
  /**
   * Whether this model needs telling that a missing quote is not a reason to
   * drop a finding.
   *
   * A property of the model rather than of the local engine, because the two
   * measured differently. The 9B silently omits real items rather than cite
   * them awkwardly, and the clause is worth +3 located findings per run
   * against a non-overlapping noise band. The 35B never had the problem, and
   * adding the clause raised its elision rate - so switching model has to
   * switch this with it.
   */
  needsQuoteCoverageClause: boolean;
};

export const AiLocalModels: Record<AiLocalModel, AiLocalModelInfo> = {
  "qwen3.5-9b": {
    label: "Qwen3.5 9B",
    url: "https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-UD-Q4_K_XL.gguf",
    fileName: "Qwen3.5-9B-UD-Q4_K_XL.gguf",
    approxBytes: 5_966_095_584,
    needsQuoteCoverageClause: true,
    notes:
      "The default, and the recommendation for almost everyone. 5.6GB, so it fits a 12GB GPU comfortably and runs about three times faster than the larger model. Correct on every classification and every game across 27 measured runs. It also finds more of what it is looking for: on a settings table it listed ten settings where the larger model listed six, and all four extras were real. Fewer of its quotes carry a clickable timestamp - about three in four against nine in ten.",
  },
  "qwen3.6-35b-a3b": {
    label: "Qwen3.6 35B-A3B",
    url: "https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF/resolve/main/Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf",
    fileName: "Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf",
    approxBytes: 24_051_000_000,
    needsQuoteCoverageClause: false,
    notes:
      "A trade rather than an upgrade, and worth understanding before switching. It quotes the video more accurately, so more findings get a timestamp you can click - roughly nine in ten against the 9B's three in four - and it writes fuller summaries. But wherever the answer is a list it returns fewer entries: six settings against the 9B's ten on the same review, with the missing four all genuine. Richer writing, less complete tables. It is also around three times slower, and the memory is the real cost: 22.4GB that must stay resident, so realistically a 32GB machine, and more than a 16GB graphics card can hold. Only about 3B parameters are active per token, so it is not as slow as its size suggests, but a machine that cannot keep it cached will read from disk for every token and be unusable.",
  },
};

export const AiLocalProviderConfig = z.object({
  enabled: z
    .boolean()
    .default(false)
    .describe("Analyse on this machine instead of paying an API. Slower, but it costs nothing to run."),
  /**
   * Deliberately a list of one.
   *
   * A smaller model was measured and rejected rather than offered with a
   * caveat: it fabricated a figure once and looped on another item, and in a
   * system whose worst failure is an invented number that reads exactly like a
   * real one, a warning next to a dropdown entry is not a safeguard - people
   * pick the faster option and never read it. Anyone who genuinely wants a
   * different model can run their own server and point `serverUrl` at it,
   * which costs them nothing and hands nobody else a bad default.
   */
  model: AiLocalModel.default("qwen3.5-9b").describe("Which local model to analyse with."),
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
    .describe(
      "Seconds to keep the model loaded after the last analysis. A short grace period always applies, so it is never unloaded midway through a run."
    ),
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
    .describe(
      "How much text the model can consider at once, prompt and answer together. 32768 is the default and suits everything here: the largest measured prompt - a 77-minute Direct, with transcript positions included - came to roughly 22,000 tokens, leaving room for the answer. Below about 16384 a long transcript gets cut short, and the analysis quietly gets worse rather than failing. Raising it costs memory, since the model's working cache grows with it, so on a card that is already full it is a way to stop a model fitting. There is no benefit in going beyond what your model was trained for - llama-server reports that as n_ctx_train when it loads."
    ),
  /**
   * Whether to use a GPU at all.
   *
   * Separate from gpuLayers, which answers "how much" rather than "whether".
   * Setting the layer count to zero has always disabled it, but that is an
   * expert reading of a number - someone who simply does not want their card
   * touched should not have to know that. Mirrors the same switch on Whisper.
   *
   * On by default and harmless without a GPU: the image's backends are loaded
   * dynamically and a machine with no usable device just runs on the CPU.
   */
  useGpu: z
    .boolean()
    .default(true)
    .describe(
      "Use a GPU for local analysis when one is available. Turn this off to keep it on the CPU - worth doing if the same GPU is busy transcoding for a media server, where competing for it can be slower than not using it at all."
    ),
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

/**
 * Which items a scheduled backfill is allowed to pick up.
 *
 * The article condition is evidence-based rather than taste: withholding the
 * article measured at 11.6 points of classification accuracy (see
 * docs/LOCAL_AI_PHASE_AND_PROMPT_FINDINGS.md), so an item analysed before its
 * article arrives is measurably worse than the same item analysed after.
 */
export const ScheduledBackfillEligibilityConfig = z.object({
  requireSubtitles: z
    .boolean()
    .default(true)
    .describe(
      "Only analyse items that already have subtitles. Without a transcript there is nothing to summarise, so a run produces tags alone."
    ),
  requireArticle: z
    .boolean()
    .default(true)
    .describe(
      "Only analyse items with a matched Digital Foundry article. The written piece gets product names and figures right where a machine transcript garbles them, and measurably improves what the analysis produces."
    ),
  /**
   * Deliberately optional, and the toggle matters as much as the value.
   *
   * Unset means an article is *strictly* required - "only ever analyse things
   * with an article" is a legitimate thing to want, and a grace period that is
   * permanently on cannot express it. Set, it stops an item waiting forever
   * for an article that was never coming.
   *
   * Milliseconds, like every other duration in this config - the UI renders it
   * through ZodDurationField, so it is typed and read as "14d".
   */
  articleGrace: z
    .number()
    .int()
    .min(60_000)
    .optional()
    .describe(
      "How long to wait for an article before analysing without one. Leave blank to require an article always, however long it takes."
    ),
});
export type ScheduledBackfillEligibilityConfig = z.infer<typeof ScheduledBackfillEligibilityConfig>;

/** The default window: midnight until 05:00, every day. */
export const DEFAULT_SCHEDULED_BACKFILL_CRON = "0 0 * * *";
export const DEFAULT_SCHEDULED_BACKFILL_END_TIME = "05:00";

/**
 * A nightly window during which the app keeps feeding items into AI analysis.
 *
 * Two things shape everything here, and both are easy to undo by accident:
 *
 * 1. **The window gates the feeder, not the queue.** The local models queue
 *    runs normally at all times; outside the window the feeder simply stops
 *    adding. Holding the queue instead would block a download's subtitle step
 *    at 6am, which no amount of priority can rescue - nothing would be being
 *    scheduled at all.
 * 2. **One item is fed at a time**, because the window controls when work
 *    *starts*, not when it stops. Whatever is queued at close still runs to
 *    completion - killing tens of minutes of local inference at a clock
 *    boundary would waste all of it - so a batch queued at 04:59 overruns by
 *    the length of the batch, while feeding singly bounds it to one item.
 *
 * The feeder waits for the queue to be free rather than pacing against a
 * clock, which makes it adapt to the machine with nothing to configure.
 */
export const ScheduledBackfillConfig = z.object({
  enabled: z.boolean().default(false).describe("Work through un-analysed content automatically, overnight."),
  /**
   * Cron, because a window cannot be one expression - cron describes instants,
   * not ranges - so this is only the *opening* instant and `endTime` closes it.
   *
   * Stored as cron even though the UI is plain start/until/day controls, so
   * the friendly controls and the advanced field are one setting rather than
   * two that can disagree.
   */
  schedule: z
    .string()
    .default(DEFAULT_SCHEDULED_BACKFILL_CRON)
    .describe("When the window opens, as a cron expression. The controls above write this for you."),
  /** When the window closes, as HH:mm. Crossing midnight is normal and expected. */
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be a time of day like 05:00")
    .default(DEFAULT_SCHEDULED_BACKFILL_END_TIME)
    .describe("When the window stops starting new analyses. Earlier than the start time means it ends the next day."),
  /**
   * Which engine fed runs use. Unset follows the AI Analysis default.
   *
   * Scheduling a hosted run is legitimate rather than a mistake - it decides
   * when you spend and when results are waiting for you - so this is not
   * restricted to local.
   */
  provider: AiProviderId.optional().describe("Which engine scheduled runs use. Leave unset to follow the default above."),
  eligibility: ScheduledBackfillEligibilityConfig.prefault({}),
  /**
   * A ceiling on how many one window may start.
   *
   * Mainly a spend guard for hosted runs, which is why the settings panel only
   * offers it when the engine is Claude - for local runs the machine is the
   * only limit that means anything.
   */
  maxPerWindow: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Stop after this many analyses in one window. Leave blank for no limit."),
});
export type ScheduledBackfillConfig = z.infer<typeof ScheduledBackfillConfig>;

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
  /**
   * The overnight feeder. Optional rather than prefaulted, so an install that
   * has never seen this key parses unchanged and no config patch is needed -
   * absent and "present but disabled" mean the same thing here.
   */
  scheduledBackfill: ScheduledBackfillConfig.optional(),
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
   * The name of the model that will actually answer.
   *
   * Not the same as `config.model`, which is only the hosted one - reporting
   * that for a local run names an engine that had nothing to do with it.
   * Pure, so a log line or a label can ask without constructing a provider.
   */
  resolveModelName: (config: AiAnalysisConfig, requested?: AiProviderId): string =>
    AiAnalysisConfigUtils.resolveProvider(config, requested) === "local" ? config.local.model : config.model,

  /**
   * The effort value that may actually be sent for this config, or
   * undefined when the parameter must be omitted entirely.
   */
  resolveEffort: (config: AiAnalysisConfig): AiAnalysisEffort | undefined =>
    AiAnalysisModelCapabilities[config.model].supportsEffort ? config.effort : undefined,

  /**
   * The engine a scheduled run would actually use, and whether that is the
   * one that was asked for.
   *
   * Shared rather than computed twice because the settings panel has to say
   * which engine will run before anything runs, and the feeder has to use
   * the same answer - a panel promising "on this machine" while the feeder
   * spends money on Claude is the worst version of this feature.
   *
   * Falls back the way every other unattended path does (see resolveProvider):
   * an overnight backfill stopping because the preferred engine was turned off
   * is worse than it running on the other one. `fellBack` exists so that is
   * *said* rather than discovered from a bill - the panel shows it and the
   * feeder logs it.
   */
  resolveScheduledProvider: (
    config: AiAnalysisConfig | undefined
  ): { provider?: AiProviderId; requested?: AiProviderId; fellBack: boolean } => {
    if (!config) {
      return { fellBack: false };
    }
    const requested = config.scheduledBackfill?.provider;
    const provider = AiAnalysisConfigUtils.resolveProvider(config, requested);
    return { provider, requested, fellBack: Boolean(requested && provider && provider !== requested) };
  },
};
