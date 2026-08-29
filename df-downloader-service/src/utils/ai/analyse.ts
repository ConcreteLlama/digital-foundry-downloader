import Anthropic from "@anthropic-ai/sdk";
import {
  AiAnalysisCostEstimate,
  AiAnalysisResult,
  AiAnalysisUsage,
  AiEvidenceSource,
  AiStructuredData,
  AiTagSuggestion,
  DfContentEntry,
  logger,
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
import { resolveTranscript } from "./transcript.js";
import {
  WireConsoleComparison,
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
const EXTRACTABLE_TYPES: WireContentType[] = ["console_comparison", "pc_review_settings", "qa_roundtable"];

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
};

type PreparedCall = {
  system: string;
  content: string;
  tagsOnly: boolean;
  evidence: AiEvidenceSource[];
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
  const resolved = wantsTranscript && !inputs.transcriptText ? await resolveTranscript(entry) : undefined;

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
  };
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
      case "qa_roundtable": {
        const { parsed, usage } = await callStructured(
          client, config, WireQaSegments, prepared.system, prepared.content, instruction
        );
        return parsed.segments.length
          ? { data: { contentType: "qa_roundtable", segments: parsed.segments }, usage }
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
export const analyseContent = async (config: AiAnalysisConfig, inputs: AnalysisInputs): Promise<AiAnalysisResult> => {
  const started = new Date();
  const base = {
    analysedAt: started,
    model: config.model,
    tags: [] as AiTagSuggestion[],
    evidence: [] as AiEvidenceSource[],
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
      return {
        ...base,
        contentType: parsed.contentType,
        contentTypeConfidence: parsed.contentTypeConfidence,
        evidence: prepared.evidence,
        tags: config.features.tagging.enabled ? mapTags(parsed.tags, prepared.evidence, autoApply) : [],
        usage,
      };
    }

    const { parsed: overview, usage: overviewUsage } = await callStructured(
      client, config, WireOverview, prepared.system, prepared.content, buildOverviewInstruction(config)
    );

    let usage = overviewUsage;
    let structuredData: AiStructuredData | undefined;

    if (config.features.structuredData && EXTRACTABLE_TYPES.includes(overview.contentType)) {
      const extraction = await extractStructuredData(client, config, prepared, overview.contentType);
      structuredData = extraction.data;
      if (extraction.usage) {
        usage = addUsage(usage, extraction.usage);
      }
    }

    return {
      ...base,
      contentType: overview.contentType,
      contentTypeConfidence: overview.contentTypeConfidence,
      articleUrl: inputs.articleUrl,
      articleTitle: inputs.articleTitle,
      summary: config.features.summary ? overview.summary : undefined,
      conclusion: config.features.summary ? overview.conclusion : undefined,
      structuredData,
      tags: config.features.tagging.enabled ? mapTags(overview.tags, prepared.evidence, autoApply) : [],
      evidence: prepared.evidence,
      usage,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log("error", `AI analysis failed for ${inputs.entry.key}: ${message}`);
    return { ...base, contentType: "other", evidence: prepared.evidence, error: message };
  }
};
