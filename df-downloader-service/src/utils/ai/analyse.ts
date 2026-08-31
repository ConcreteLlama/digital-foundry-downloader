import Anthropic from "@anthropic-ai/sdk";
import {
  AiAnalysisCostEstimate,
  AiAnalysisResult,
  AiAnalysisUsage,
  AiContentTypeGameSubject,
  AiEvidenceSource,
  AiStructuredData,
  AiTagSuggestion,
  DfContentEntry,
  logger,
  SrtLine,
} from "df-downloader-common";
import { AiAnalysisConfig, AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import { Chapter } from "../chatpers.js";
import { calculateCostUsd, callStructured, countInputTokens, makeAnthropicClient } from "./anthropic-client.js";
import {
  buildContentBlock,
  buildExtractionInstruction,
  buildOverviewInstruction,
  buildSystemPrompt,
  buildTagOnlyContentBlock,
  buildTagOnlyInstruction,
} from "./prompts.js";
import { ResolvedTranscript, locateQuote, resolveTranscript, srtLinesToTextWithOffsets } from "./transcript.js";
import {
  WireConsoleComparison,
  WireHardwareReview,
  WirePlatformAnalysis,
  WirePreview,
  WireContentType,
  WireOverview,
  WirePcReviewSettings,
  WireQaSegments,
  WireTagOnly,
} from "./wire-schemas.js";

/**
 * Projected output size, in tokens, for the pre-run cost estimate.
 *
 * Input tokens are counted exactly by the API; output cannot be known
 * before the call, so these come from measured runs against real Digital
 * Foundry content rather than being invented. A thinking-enabled model
 * bills its invisible reasoning as output tokens, and that reasoning can
 * dwarf the visible answer - so the projection is scaled up for those
 * models rather than pretending the visible response is the whole bill.
 */
const ESTIMATED_OUTPUT_TOKENS_OVERVIEW = 900;
const ESTIMATED_OUTPUT_TOKENS_EXTRACTION = 1200;
const ESTIMATED_OUTPUT_TOKENS_TAGS_ONLY = 200;
const THINKING_OUTPUT_MULTIPLIER = 3;

/** The types worth a second, structure-extracting call. */
const EXTRACTABLE_TYPES: WireContentType[] = [
  "console_comparison",
  "platform_analysis",
  "pc_review_settings",
  "hands_on_preview",
  "hardware_review",
  "qa_roundtable",
  "news_discussion",
  "roundup_list",
];

export type AnalysisInputs = {
  entry: DfContentEntry;
  chapters?: Chapter[];
  articleText?: string;
  articleUrl?: string;
  articleTitle?: string;
  /**
   * Transcript text supplied directly, bypassing the usual lookup.
   *
   * Needed by the during-download path: the transcript has just been
   * generated in the same pipeline, but the download is not recorded in the
   * DB until the whole pipeline succeeds, so there is no download entry for
   * resolveTranscript to find a sidecar against. The caller has the text in
   * hand, so it hands it over rather than the resolver going looking for
   * something that is not filed yet.
   */
  transcriptText?: string;
  /**
   * The same transcript as cues rather than prose.
   *
   * Preferred over transcriptText where the caller has it, because the
   * timings are what let a quoted finding be located. Flattening to text
   * throws them away, and the sidecar they could be recovered from may not
   * be written yet on the during-download path.
   */
  transcriptLines?: SrtLine[];
};

type PreparedCall = {
  system: string;
  content: string;
  tagsOnly: boolean;
  evidence: AiEvidenceSource[];
  /** Present when the transcript carried timings, so findings can be anchored. */
  transcript?: ResolvedTranscript;
};

const addUsage = (a: AiAnalysisUsage | undefined, b: AiAnalysisUsage): AiAnalysisUsage => ({
  inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
  outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
  costUsd: (a?.costUsd ?? 0) + b.costUsd,
});

/**
 * Assembles everything a run will send, without sending it.
 *
 * Separated from the call itself so the cost estimate and the real run are
 * built by exactly the same code - an estimate produced by a parallel
 * implementation is an estimate of something other than what runs, and
 * would drift silently the first time either side changed.
 */
export const prepareAnalysis = async (config: AiAnalysisConfig, inputs: AnalysisInputs): Promise<PreparedCall> => {
  const { entry, chapters, articleText } = inputs;
  const { contentInfo } = entry;

  const wantsTranscript =
    config.features.summary || config.features.structuredData || config.features.tagging.useTranscriptWhenAvailable;
  const fromLines =
    wantsTranscript && inputs.transcriptLines?.length
      ? { ...srtLinesToTextWithOffsets(inputs.transcriptLines), source: "sidecar" as const }
      : undefined;
  const resolved =
    fromLines ?? (wantsTranscript && !inputs.transcriptText ? await resolveTranscript(entry) : undefined);

  let transcript = inputs.transcriptText || resolved?.text;
  if (transcript && transcript.length > config.maxTranscriptChars) {
    // Refuse rather than truncate. A transcript cut off part-way produces
    // an analysis that looks complete but silently omits whatever was in
    // the back half - which, for a review, is usually the verdict.
    logger.log(
      "warn",
      `Transcript for ${entry.key} is ${transcript.length} characters, over the ${config.maxTranscriptChars} limit - analysing without it`
    );
    transcript = undefined;
  }
  if (resolved && transcript) {
    logger.log("info", `Using ${resolved.source} transcript for ${entry.key} (${transcript.length} characters)`);
  }

  const evidence: AiEvidenceSource[] = ["title"];
  if (contentInfo.description?.trim()) {
    evidence.push("description");
  }
  if (articleText) {
    evidence.push("article");
  }
  if (transcript) {
    evidence.push("transcript");
  }

  // With neither a transcript nor an article there is nothing to summarise
  // from - only tagging is honest at that point, and the design is
  // explicit that tagging must not be gated on a transcript existing.
  const tagsOnly = !transcript && !articleText;
  const flags = { hasTranscript: Boolean(transcript), hasArticle: Boolean(articleText) };

  return {
    system: buildSystemPrompt(flags),
    content: tagsOnly ? buildTagOnlyContentBlock(contentInfo) : buildContentBlock({ contentInfo, transcript, chapters, articleText }),
    tagsOnly,
    evidence,
    // Only when the text actually sent is the one we hold offsets for. A
    // transcript passed in as prose, or dropped for exceeding the length
    // limit, cannot anchor anything - and a quote located against different
    // text would be worse than no timestamp at all.
    transcript: resolved && transcript === resolved.text ? resolved : undefined,
  };
};

/**
 * One de-duplicated list of every game a run turned up.
 *
 * Three sources, because they see different things: the primary subject, the
 * overview call's own list, and the games named by individual segments of a
 * discussion show - which the overview never considers one at a time.
 *
 * Case-insensitive de-duplication only. Anything cleverer belongs in
 * canonicaliseGame, which the index already applies, and doing it twice in
 * two places would just give two subtly different answers.
 */
const mergeGames = (
  contentType: WireContentType,
  primaryGame?: string | null,
  games?: string[] | null,
  structuredData?: AiStructuredData
): string[] => {
  const segmented =
    structuredData &&
    (structuredData.contentType === "qa_roundtable" ||
      structuredData.contentType === "news_discussion" ||
      structuredData.contentType === "roundup_list")
      ? structuredData
      : undefined;
  const segmentGames = segmented ? segmented.segments.map((segment) => segment.game).filter(Boolean) : [];

  /*
   * For a show made of items, the items are the authority on what it covered.
   *
   * The overview call sees the whole transcript at once and reads "covers"
   * generously - a single Q+A came back listing fourteen games where only two
   * were actually discussed, the rest being passing comparisons and bits of
   * history. Filing the episode under all fourteen would put it in front of
   * anyone looking for a game it merely name-dropped. The per-item pass has
   * already decided what each segment is about, so where it found anything,
   * that list wins.
   */
  /*
   * What counts as coverage depends on the kind of video, so the taxonomy
   * decides rather than the model's judgement.
   *
   * A type that is about exactly one game covers exactly that game: anything
   * else the model listed is a comparison, a series predecessor or - measured
   * on a real preview - not a game at all ("Unreal Engine 5"). Asking the
   * prompt for restraint here did not hold; the schema already knows the
   * answer, so it is taken rather than requested.
   */
  const subject = AiContentTypeGameSubject[contentType];
  const covered =
    subject === "single"
      ? primaryGame
        ? []
        : games ?? []
      : segmentGames.length
        ? segmentGames
        : games ?? [];
  const out: string[] = [];
  for (const name of [primaryGame, ...covered]) {
    const trimmed = name?.trim();
    if (trimmed && !out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out;
};

/**
 * Resolves each quoted finding to the moment it was said.
 *
 * Walks the structured payload rather than being folded into extraction,
 * so the model's answer and where it sits are separate steps: the model
 * cites, this locates. A quote that cannot be found leaves the timestamp
 * null and keeps the quote, which is the honest outcome and also the
 * evidence for why it failed.
 */
const anchorFindings = (data: AiStructuredData, transcript?: ResolvedTranscript): AiStructuredData => {
  if (!transcript) {
    return data;
  }
  const at = <T extends { quote?: string | null }>(item: T) => ({
    ...item,
    timestampSeconds: item.quote ? locateQuote(transcript, item.quote) ?? null : null,
  });

  switch (data.contentType) {
    case "console_comparison":
      return {
        ...data,
        platforms: data.platforms.map((platform) => ({ ...platform, modes: platform.modes.map(at) })),
        knownIssues: data.knownIssues.map(at),
      };
    case "platform_analysis":
      return {
        ...data,
        platforms: data.platforms.map((platform) => ({ ...platform, modes: platform.modes.map(at) })),
        knownIssues: data.knownIssues.map(at),
      };
    case "pc_review_settings":
      return { ...data, settings: data.settings.map(at) };
    case "hands_on_preview":
      return { ...data, observations: data.observations.map(at) };
    case "hardware_review":
      return { ...data, products: data.products.map(at), knownIssues: data.knownIssues.map(at) };
    case "qa_roundtable":
    case "news_discussion":
    case "roundup_list":
      return { ...data, segments: data.segments.map(at) };
  }
};

/**
 * What a run will cost, before committing to it.
 *
 * Costs one cheap token-counting request rather than being free, which is
 * the trade for the number being real. Deliberately surfaced: this project
 * is used by people running it on their own hardware who care what a
 * feature spends, and "it calls an API" is a much worse pitch than a
 * figure in pence.
 *
 * The two-call structure is priced as: the overview call pays for the
 * content in full, the extraction call re-reads it from cache at a tenth
 * of the price. That mirrors what actually happens, so the estimate does
 * not overstate the cost by nearly double.
 */
export const estimateAnalysisCost = async (
  config: AiAnalysisConfig,
  inputs: AnalysisInputs
): Promise<AiAnalysisCostEstimate> => {
  const client = makeAnthropicClient(config);
  const prepared = await prepareAnalysis(config, inputs);
  const instruction = prepared.tagsOnly ? buildTagOnlyInstruction(config) : buildOverviewInstruction(config);
  const inputTokens = await countInputTokens(client, config, prepared.system, prepared.content, instruction);

  const capabilities = AiAnalysisConfigUtils.capabilities(config.model);
  const scale = capabilities.supportsThinking ? THINKING_OUTPUT_MULTIPLIER : 1;

  if (prepared.tagsOnly) {
    const estimatedOutputTokens = ESTIMATED_OUTPUT_TOKENS_TAGS_ONLY * scale;
    return {
      model: config.model,
      inputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: calculateCostUsd(config.model, inputTokens, estimatedOutputTokens),
      tagsOnly: true,
    };
  }

  // Whether a second call happens depends on a classification that has not
  // been made yet, so the estimate assumes it does. Erring high is the
  // right way round for a number someone decides to spend money on.
  const secondCallLikely = config.features.structuredData;
  const estimatedOutputTokens =
    (ESTIMATED_OUTPUT_TOKENS_OVERVIEW + (secondCallLikely ? ESTIMATED_OUTPUT_TOKENS_EXTRACTION : 0)) * scale;
  const cachedRereadTokens = secondCallLikely ? inputTokens * 0.1 : 0;

  return {
    model: config.model,
    inputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: calculateCostUsd(config.model, inputTokens + cachedRereadTokens, estimatedOutputTokens),
    tagsOnly: false,
  };
};

const mapTags = (
  wireTags: { tag: string; confidence: number }[],
  evidence: AiEvidenceSource[],
  autoApply: boolean
): AiTagSuggestion[] =>
  wireTags.map((tag) => ({
    tag: tag.tag,
    status: autoApply ? ("accepted" as const) : ("suggested" as const),
    // The evidence recorded per tag is the evidence the run had. Stored on
    // each suggestion rather than only on the result because a tag is what
    // gets surfaced, filtered on and judged in isolation - how
    // well-founded it is has to travel with it.
    basis: evidence,
    confidence: tag.confidence,
  }));

/**
 * The second call: structured extraction for the classified type.
 *
 * Returns undefined rather than throwing when extraction fails. A run that
 * produced a good summary and then failed to tabulate it is still worth
 * keeping - losing the whole result over the optional half would be a
 * poor trade, and the failure is logged either way.
 */
const extractStructuredData = async (
  client: Anthropic,
  config: AiAnalysisConfig,
  prepared: PreparedCall,
  contentType: WireContentType
): Promise<{ data?: AiStructuredData; usage?: AiAnalysisUsage }> => {
  const instruction = buildExtractionInstruction(contentType);
  if (!instruction) {
    return {};
  }
  try {
    switch (contentType) {
      case "console_comparison": {
        const { parsed, usage } = await callStructured(
          client, config, WireConsoleComparison, prepared.system, prepared.content, instruction
        );
        return {
          data: {
            contentType: "console_comparison",
            game: parsed.game,
            developer: parsed.developer,
            platforms: parsed.platforms,
            knownIssues: parsed.knownIssues,
            recommendation: parsed.recommendation,
          },
          usage,
        };
      }
      case "pc_review_settings": {
        const { parsed, usage } = await callStructured(
          client, config, WirePcReviewSettings, prepared.system, prepared.content, instruction
        );
        return {
          data: {
            contentType: "pc_review_settings",
            game: parsed.game,
            engine: parsed.engine,
            verdict: parsed.verdict,
            bottleneck:
              parsed.bottleneckType || parsed.bottleneckDetail
                ? { type: parsed.bottleneckType, detail: parsed.bottleneckDetail }
                : undefined,
            settings: parsed.settings,
            optimisedSettingsResult:
              parsed.optimisedTestSystem || parsed.optimisedFpsBefore != null || parsed.optimisedFpsAfter != null
                ? {
                    testSystem: parsed.optimisedTestSystem,
                    fpsBefore: parsed.optimisedFpsBefore,
                    fpsAfter: parsed.optimisedFpsAfter,
                    gainPct: parsed.optimisedGainPct,
                  }
                : undefined,
          },
          usage,
        };
      }
      case "platform_analysis": {
        const { parsed, usage } = await callStructured(
          client, config, WirePlatformAnalysis, prepared.system, prepared.content, instruction
        );
        return {
          data: {
            contentType: "platform_analysis",
            game: parsed.game,
            developer: parsed.developer,
            platforms: parsed.platforms,
            changeSummary: parsed.changeSummary,
            knownIssues: parsed.knownIssues,
            verdict: parsed.verdict,
          },
          usage,
        };
      }
      case "hands_on_preview": {
        const { parsed, usage } = await callStructured(
          client, config, WirePreview, prepared.system, prepared.content, instruction
        );
        return {
          data: {
            contentType: "hands_on_preview",
            game: parsed.game,
            platforms: parsed.platforms,
            buildState: parsed.buildState,
            observations: parsed.observations,
            caveats: parsed.caveats,
          },
          usage,
        };
      }
      case "hardware_review": {
        const { parsed, usage } = await callStructured(
          client, config, WireHardwareReview, prepared.system, prepared.content, instruction
        );
        return {
          data: {
            contentType: "hardware_review",
            products: parsed.products,
            gamesTested: parsed.gamesTested,
            verdict: parsed.verdict,
            knownIssues: parsed.knownIssues,
          },
          usage,
        };
      }
      case "qa_roundtable":
      case "news_discussion":
      case "roundup_list": {
        const { parsed, usage } = await callStructured(
          client, config, WireQaSegments, prepared.system, prepared.content, instruction
        );
        return parsed.segments.length
          ? { data: { contentType, segments: parsed.segments }, usage }
          : { usage };
      }
      default:
        return {};
    }
  } catch (e) {
    logger.log("warn", `Structured extraction failed for ${contentType}: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
};

/**
 * Runs the analysis and returns a storable result.
 *
 * Never throws for an ordinary failure - a failed run is recorded as a
 * result carrying an `error`, so the UI can show that analysis was tried
 * and did not work, rather than rendering identically to content nobody
 * has ever analysed.
 */
/**
 * Reports the outcome of a run at a glance.
 *
 * Worth a line of its own because "analysis succeeded" and "analysis produced
 * anything useful" are different things - a run can come back clean having
 * found no tags and no structured data, and without this the log would show
 * only that it started.
 */
const logAnalysisOutcome = (
  entryKey: string,
  result: {
    contentType: string;
    tags: unknown[];
    summary?: string | null;
    structuredData?: unknown;
    usage?: AiAnalysisUsage;
  },
  startedAt: Date
) => {
  const produced = [
    `${result.tags.length} tag(s)`,
    result.summary ? "summary" : null,
    result.structuredData ? "structured data" : null,
  ].filter(Boolean);
  const tokens = result.usage
    ? `, ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens`
    : "";
  logger.log(
    "info",
    `AI analysis complete for ${entryKey}: ${result.contentType}, produced ${produced.join(" + ")} in ${
      Date.now() - startedAt.getTime()
    }ms${tokens}`
  );
};

export const analyseContent = async (config: AiAnalysisConfig, inputs: AnalysisInputs): Promise<AiAnalysisResult> => {
  const started = new Date();
  const base = {
    analysedAt: started,
    model: config.model,
    tags: [] as AiTagSuggestion[],
    evidence: [] as AiEvidenceSource[],
    // Present even on the failure paths: a stored result with no games is a
    // truthful "covers nothing", where a missing field would be indistinguishable
    // from a record written before the field existed.
    games: [] as string[],
  };

  let client: Anthropic;
  try {
    client = makeAnthropicClient(config);
  } catch (e) {
    return { ...base, contentType: "other", error: e instanceof Error ? e.message : String(e) };
  }

  const prepared = await prepareAnalysis(config, inputs);
  const autoApply = config.features.tagging.applyMode === "auto_apply";

  try {
    if (prepared.tagsOnly) {
      const { parsed, usage } = await callStructured(
        client, config, WireTagOnly, prepared.system, prepared.content, buildTagOnlyInstruction(config)
      );
      const tagOnlyResult = {
        ...base,
        contentType: parsed.contentType,
        contentTypeConfidence: parsed.contentTypeConfidence,
        primaryGame: parsed.primaryGame,
        games: mergeGames(parsed.contentType, parsed.primaryGame, parsed.games),
        evidence: prepared.evidence,
        tags: config.features.tagging.enabled ? mapTags(parsed.tags, prepared.evidence, autoApply) : [],
        usage,
      };
      logAnalysisOutcome(inputs.entry.key, tagOnlyResult, started);
      return tagOnlyResult;
    }

    const { parsed: overview, usage: overviewUsage } = await callStructured(
      client, config, WireOverview, prepared.system, prepared.content, buildOverviewInstruction(config)
    );

    let usage = overviewUsage;
    let structuredData: AiStructuredData | undefined;

    if (config.features.structuredData && EXTRACTABLE_TYPES.includes(overview.contentType)) {
      const extraction = await extractStructuredData(client, config, prepared, overview.contentType);
      structuredData = extraction.data ? anchorFindings(extraction.data, prepared.transcript) : undefined;
      if (extraction.usage) {
        usage = addUsage(usage, extraction.usage);
      }
    }

    const result = {
      ...base,
      contentType: overview.contentType,
      contentTypeConfidence: overview.contentTypeConfidence,
      primaryGame: overview.primaryGame,
      // Segments name games the overview call never saw individually, so the
      // two sources are merged - that is the whole point of a Direct being
      // findable under each game it discussed.
      games: mergeGames(overview.contentType, overview.primaryGame, overview.games, structuredData),
      articleUrl: inputs.articleUrl,
      articleTitle: inputs.articleTitle,
      summary: config.features.summary ? overview.summary : undefined,
      conclusion: config.features.summary ? overview.conclusion : undefined,
      structuredData,
      tags: config.features.tagging.enabled ? mapTags(overview.tags, prepared.evidence, autoApply) : [],
      evidence: prepared.evidence,
      usage,
    };
    logAnalysisOutcome(inputs.entry.key, result, started);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log("error", `AI analysis failed for ${inputs.entry.key}: ${message}`);
    return { ...base, contentType: "other", evidence: prepared.evidence, error: message };
  }
};
