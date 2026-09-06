import { resolveChapters } from "./chapters.js";
import {
  AiAnalysisCostEstimate,
  AiAnalysisResult,
  AiAnalysisSourceSelection,
  AiAnalysisUsage,
  AiContentTypeGameSubject,
  AiEvidenceSource,
  AiStructuredData,
  AiTagSuggestion,
  DfContentEntry,
  logger,
  SrtLine, TaskOutputField} from "df-downloader-common";
import { AiAnalysisConfig, AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import { Chapter } from "../chatpers.js";
import { AiProviderId } from "df-downloader-common/config/ai-analysis-config.js";
import { estimateLocalDurationMs } from "./local-throughput.js";
import { makeProvider } from "./providers/resolve.js";
import { AiProvider } from "./providers/types.js";
import {
  buildContentBlock,
  PromptFlags,
  buildExtractionInstruction,
  buildOverviewInstruction,
  buildClassificationInstruction,
  buildSummaryInstruction,
  buildSystemPrompt,
  buildTagOnlyContentBlock,
  buildTagOnlyInstruction,
} from "./prompts.js";
import {
  ResolvedTranscript,
  locateQuote,
  quoteAppearsIn,
  resolveTranscript,
  srtLinesToTextWithOffsets,
} from "./transcript.js";
import {
  WirePlatformTechReview,
  WireHardwareReview,
  WirePreview,
  WireContentType,
  WireOverview,
  WireClassification,
  WireSummary,
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

/**
 * The types worth a second, structure-extracting call.
 *
 * `interview` reuses the segment shape rather than getting a schema of its
 * own - an interview is a sequence of topics with something quotable said
 * about each, which is what WireQaSegments already describes. Measured on the
 * two known interviews it returned 7 and 8 well-scoped technical segments.
 *
 * Still no payload for `tech_explainer` or `other`, each for its own reason.
 * `tech_explainer` probably deserves one - 21 items, strikingly coherent, all
 * "a named technology, tested or compared" - but the schema needs designing
 * against real transcript-grounded output rather than guessed at. `other` is
 * the deliberate escape hatch and should stay empty of structure.
 */
const EXTRACTABLE_TYPES: WireContentType[] = [
  "platform_tech_review",
  "pc_review_settings",
  "hands_on_preview",
  "hardware_review",
  "qa_roundtable",
  "news_discussion",
  "roundup_list",
  "interview",
];

/**
 * Where a run has got to, for a status message.
 *
 * Steps rather than a percentage, because generation has no honest one: the
 * model decides when it stops, so any bar would rest on a guess about output
 * length. How many calls a run makes is knowable; how far through one is, is
 * not.
 */
export type AnalysisStage = {
  step: number;
  of: number;
  label: string;
  /**
   * Blocked waiting for the machine rather than working - see LocalComputeGate.
   *
   * Reported separately from the label because it is not a step of its own: the
   * run has not moved on, it has not started. A caller should say so rather
   * than showing the step it is about to do with a frozen token count, which
   * is what made a waiting analysis look like a hung one.
   */
  waiting?: boolean;
  /**
   * How much of the run is behind you, from the weights below.
   *
   * Only ever advances at step boundaries, which are the points genuinely
   * known. It is not interpolated within a step, because that would need an
   * expected output length and there is no such thing - see outputTokens.
   */
  /**
   * Tokens generated so far in the current call, where the engine reports them.
   *
   * A running count and deliberately not a fraction: the model decides when it
   * stops, so any percentage would be measured against an invented total.
   */
  outputTokens?: number;
};

/**
 * How the three local calls divide the wait.
 *
 * Measured over three runs of six items on Qwen3.5-9B fully on GPU: classify
 * 3.7%, summarise 30.2%, extract 66.1%. Extraction is two thirds of it, so
 * treating the calls as equal thirds would show a progress figure that stalls
 * for most of the run.
 *
 * Explicitly a 9B measurement. The larger model runs its experts on CPU, which
 * is expected to shift the balance toward prompt processing, and that has not
 * been measured - so this is a named default to be replaced with evidence,
 * not a universal constant.
 */
const LOCAL_CALL_WEIGHTS = { classify: 0.037, summarise: 0.302, extract: 0.661 };

/**
 * What each call is called, in one place.
 *
 * Named here rather than at the call sites because the plan announced up
 * front and the stage reported as each one starts have to agree exactly - the
 * consumer matches them by name, and two copies of a string is how that stops
 * working silently.
 */
/** How much of a phase's output to write to the log. */
const PHASE_OUTPUT_LOG_CHARS = 2000;

/**
 * What a call actually returned, as it returns it.
 *
 * Written per phase rather than only at the end, because the end is too late:
 * a run whose first call comes back empty goes on to spend twenty more
 * minutes producing nothing, and the only sign used to be a finished analysis
 * with blank fields. Seeing the first phase's output land empty is the moment
 * to stop and look.
 *
 * The shape goes to warn when nothing usable came back - that is the case
 * worth interrupting someone for - and the content to debug, where it can be
 * read when the shape alone is not enough.
 */
/** A summary call's outcome in a few words - see AnalysisInputs.onPhaseOutcome. */
const describeOverviewOutcome = (parsed: { summary?: string | null; conclusion?: string | null; tags?: unknown[] }) => {
  const parts = [`${parsed.summary?.length ?? 0} char summary`];
  if (parsed.conclusion?.length) {
    parts.push(`${parsed.conclusion.length} char verdict`);
  }
  if (parsed.tags?.length) {
    parts.push(`${parsed.tags.length} tags`);
  }
  return parts.join(", ");
};

/** The summary call's result as rows - see TaskOutputField. */
const overviewOutputFields = (parsed: {
  summary?: string | null;
  conclusion?: string | null;
  tags?: { tag: string }[] | null;
}): TaskOutputField[] => [
  ...(parsed.summary ? [{ label: "Summary", value: parsed.summary, long: true }] : []),
  ...(parsed.conclusion ? [{ label: "Verdict", value: parsed.conclusion, long: true }] : []),
  ...(parsed.tags?.length ? [{ label: "Tags", value: parsed.tags.map((tag) => tag.tag).join(", ") }] : []),
];

const logPhaseOutput = (contentKey: string, label: string, parsed: unknown) => {
  const serialised = JSON.stringify(parsed) ?? "";
  const strings = collectStrings(parsed);
  const empty = strings.length > 0 && strings.every((value) => !value.trim());
  logger.log(
    empty ? "warn" : "debug",
    empty
      ? `Analysis ${contentKey} - "${label}" returned nothing usable: every text field came back empty. This is what a model producing garbage looks like from here; the run will keep going and produce a blank result.`
      : `Analysis ${contentKey} - "${label}" returned ${serialised.length} chars`
  );
  logger.log(
    "debug",
    `Analysis ${contentKey} - "${label}" output: ${
      serialised.length > PHASE_OUTPUT_LOG_CHARS ? `${serialised.slice(0, PHASE_OUTPUT_LOG_CHARS)}… (truncated)` : serialised
    }`
  );
};

/** Every string in a parsed result, however deeply nested. */
const collectStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
};

const PHASE_LABELS = {
  classify: "Working out what kind of video this is",
  summarise: "Writing the summary",
  overview: "Reading the video",
  extract: "Pulling out the details",
  tagsOnly: "Suggesting tags",
} as const;

export type AnalysisInputs = {
  entry: DfContentEntry;
  /** Called as the run moves between calls, purely so the UI can say what it is doing. */
  onStage?: (stage: AnalysisStage) => void;
  /**
   * The calls this run intends to make, announced once they are known.
   *
   * Separate from onStage because the shape of a run is decided by the engine
   * - a hosted model does classification and summary in one call, a local one
   * splits them - and that is only settled after the provider is resolved. A
   * consumer wanting to show the parts of a run needs them all up front, not
   * one at a time as each begins.
   *
   * The last one may not happen: whether a video's type supports extraction
   * is only known once classification has run. Announced anyway, on the same
   * reasoning as the step count and the cost estimate - a run that finishes a
   * step early is a better surprise than one that grows a step.
   */
  onPlan?: (phases: { name: string; weight: number }[]) => void;
  /**
   * What a call decided, once it has decided it.
   *
   * Distinct from onStage, which says what is happening now. This says what
   * came of it - the content type, how much prose was written, what was
   * extracted - so a finished part of a run shows its result rather than the
   * progress number it happened to stop on.
   */
  onPhaseOutcome?: (label: string, outcome: string, output?: TaskOutputField[]) => void;
  /**
   * Which engine to use, overriding the configured default for this run only.
   * Absent means use the default, which is what an unattended run does.
   */
  provider?: AiProviderId;
  /**
   * Which sources this run may read, overriding the configured defaults for
   * this run only. Absent means use the config, which is what an automatic
   * run after a download does.
   */
  sources?: AiAnalysisSourceSelection;
  /** See resolveChapters - only the interactive single-item path sets this. */
  allowRemoteChapters?: boolean;
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
  /** Which sources this run actually has, for guidance that depends on it. */
  flags: PromptFlags;
  system: string;
  content: string;
  tagsOnly: boolean;
  evidence: AiEvidenceSource[];
  /** Present when the transcript carried timings, so findings can be anchored. */
  transcript?: ResolvedTranscript;
  /** Content with `[Ns]` transcript markers, for extraction when it fits the context. */
  contentMarked?: string;
  /**
   * The article text, when one was used.
   *
   * Carried purely so anchoring can tell a correct article citation from an
   * invented quote. Without it every article-sourced finding looks identical
   * to a hallucination.
   */
  articleText?: string;
};

/**
 * Totals the two calls of a run.
 *
 * Money and time are summed only where they were reported at all: absent has
 * to stay absent, because turning it into zero is exactly the claim this
 * whole distinction exists to avoid - that a local run was free rather than
 * that it cost something other than money.
 */
const addUsage = (a: AiAnalysisUsage | undefined, b: AiAnalysisUsage): AiAnalysisUsage => {
  const sumOptional = (x: number | undefined, y: number | undefined) =>
    x === undefined && y === undefined ? undefined : (x ?? 0) + (y ?? 0);
  return {
    inputTokens: (a?.inputTokens ?? 0) + b.inputTokens,
    outputTokens: (a?.outputTokens ?? 0) + b.outputTokens,
    costUsd: sumOptional(a?.costUsd, b.costUsd),
    durationMs: sumOptional(a?.durationMs, b.durationMs),
    provider: b.provider,
  };
};

/**
 * Assembles everything a run will send, without sending it.
 *
 * Separated from the call itself so the cost estimate and the real run are
 * built by exactly the same code - an estimate produced by a parallel
 * implementation is an estimate of something other than what runs, and
 * would drift silently the first time either side changed.
 */
export const prepareAnalysis = async (config: AiAnalysisConfig, inputs: AnalysisInputs): Promise<PreparedCall> => {
  const { entry } = inputs;
  const { contentInfo } = entry;

  /*
   * Read from the downloaded file when the caller did not supply them, which
   * in practice is every caller - the plumbing existed but nothing ever filled
   * it. A local ffprobe, not a YouTube request: chapters are muxed into the
   * download, so for anything on disk the file already has them.
   */
  const chapters =
    inputs.chapters ?? (await resolveChapters(entry, inputs.allowRemoteChapters).catch(() => undefined));

  /*
   * A deselected source is not read at all, rather than read and ignored.
   * For the transcript that is the whole point - it is most of what a run
   * costs, so "don't use it" has to mean the tokens are never sent.
   */
  const sources = inputs.sources ?? config.sources;
  const articleText = sources.article ? inputs.articleText : undefined;

  const wantsTranscript =
    sources.transcript &&
    (config.features.summary || config.features.structuredData || config.features.tagging.useTranscriptWhenAvailable);
  const fromLines =
    wantsTranscript && inputs.transcriptLines?.length
      ? { ...srtLinesToTextWithOffsets(inputs.transcriptLines), source: "sidecar" as const }
      : undefined;
  const resolved =
    fromLines ?? (wantsTranscript && !inputs.transcriptText ? await resolveTranscript(entry) : undefined);

  let transcript = sources.transcript ? inputs.transcriptText || resolved?.text : undefined;
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

  /*
   * Markers are only safe when the text sent is exactly the text resolved.
   * The offsets describe the untruncated transcript, so a truncated one would
   * carry markers against the wrong words - worse than no markers at all.
   */
  const anchorable = resolved && transcript === resolved.text ? resolved : undefined;

  return {
    // Carried so the extraction instruction can vary with the sources - see
    // BOTH_SOURCES_COUNT, which only applies when there are two of them.
    flags,
    system: buildSystemPrompt(flags),
    content: tagsOnly
      // Chapters go to the cheap path too. With no transcript they are the
      // only description of what is actually in the video, and being written
      // rather than transcribed they are the most reliable source of names
      // there is - which is exactly what tagging and the game field need.
      ? buildTagOnlyContentBlock(contentInfo, chapters)
      : buildContentBlock({ contentInfo, transcript, chapters, articleText }),
    tagsOnly,
    evidence,
    // Only when the text actually sent is the one we hold offsets for. A
    // transcript passed in as prose, or dropped for exceeding the length
    // limit, cannot anchor anything - and a quote located against different
    // text would be worse than no timestamp at all.
    /*
     * The same content, but with [Ns] markers on the transcript, offered to
     * the extraction call only. Whether it is actually used is a context
     * question decided per run - see extractStructuredData.
     */
    contentMarked:
      !tagsOnly && anchorable
        ? buildContentBlock({ contentInfo, transcript: anchorable.markedText, chapters, articleText })
        : undefined,
    transcript: anchorable,
    // Unconditional, unlike the transcript above: confirming a quote exists in
    // the article needs no offsets, so there is nothing to invalidate it.
    articleText,
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
  /*
   * A hardware review's benchmarks are not coverage.
   *
   * The extraction already separates them into gamesTested, but the overview
   * call still listed all ten of a GPU review's test titles as games covered
   * despite the prompt excluding them - so a card review filed itself under
   * Cyberpunk 2077. Subtracting one from the other is deterministic and uses
   * a distinction the schema has already drawn, rather than asking the model
   * again and hoping.
   */
  const benchmarks = new Set(
    structuredData?.contentType === "hardware_review"
      ? structuredData.gamesTested.map((game) => game.trim().toLowerCase())
      : []
  );

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
    if (!trimmed || benchmarks.has(trimmed.toLowerCase())) {
      continue;
    }
    if (!out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
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
const anchorFindings = (
  data: AiStructuredData,
  transcript?: ResolvedTranscript,
  articleText?: string
): AiStructuredData => {
  if (!transcript && !articleText) {
    return data;
  }
  /*
   * Transcript first, article second, neither last.
   *
   * The order is the point. A quote found in the transcript yields an exact
   * moment and is the best outcome. One found only in the article is still a
   * correct citation - Digital Foundry writes as well as talks, and the prompt
   * tells the model to prefer the written source - it simply has no moment to
   * jump to. Only a quote in neither is suspect.
   *
   * Before this, the second and third cases were indistinguishable, and the
   * article ones are the more common of the two by roughly two to one.
   */
  /*
   * Transcript first, article second, neither last.
   *
   * The order is the point. A quote found in the transcript yields an exact
   * moment and is the best outcome. One found only in the article is still a
   * correct citation - Digital Foundry writes as well as talks, and the prompt
   * tells the model to prefer the written source - it simply has no moment to
   * jump to. Only a quote in neither is suspect.
   *
   * Measured over the stored corpus, the second case outnumbers the third by
   * roughly two to one, so treating them alike libelled correct citations more
   * often than it caught real ones.
   */
  const at = <T extends { quote?: string | null }>(item: T) => {
    if (!item.quote) {
      return { ...item, timestampSeconds: null, quoteSource: null };
    }
    const seconds = transcript ? locateQuote(transcript, item.quote) : undefined;
    if (seconds !== undefined) {
      return { ...item, timestampSeconds: seconds, quoteSource: "transcript" as const };
    }
    if (quoteAppearsIn(articleText, item.quote)) {
      return { ...item, timestampSeconds: null, quoteSource: "article" as const };
    }
    return { ...item, timestampSeconds: null, quoteSource: null };
  };

  switch (data.contentType) {
    case "platform_tech_review":
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
    case "interview":
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
  const provider = makeProvider(config, inputs.provider);
  const prepared = await prepareAnalysis(config, inputs);
  const instruction = prepared.tagsOnly ? buildTagOnlyInstruction(config) : buildOverviewInstruction(config);
  // The plain content deliberately: this sizes the overview call, which never
  // carries transcript markers - only extraction does.
  const inputTokens = await provider.countInputTokens(prepared.system, prepared.content, instruction);

  const capabilities = AiAnalysisConfigUtils.capabilities(config.model);
  const scale = capabilities.supportsThinking ? THINKING_OUTPUT_MULTIPLIER : 1;

  if (prepared.tagsOnly) {
    const estimatedOutputTokens = ESTIMATED_OUTPUT_TOKENS_TAGS_ONLY * scale;
    return {
      model: provider.model,
      inputTokens,
      estimatedOutputTokens,
      estimatedCostUsd: provider.estimateCostUsd(inputTokens, estimatedOutputTokens),
      estimatedDurationMs:
        provider.id === "local" ? estimateLocalDurationMs(inputTokens, estimatedOutputTokens) : undefined,
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
    model: provider.model,
    inputTokens,
    estimatedOutputTokens,
    estimatedCostUsd: provider.estimateCostUsd(inputTokens + cachedRereadTokens, estimatedOutputTokens),
    /*
     * The whole input, not the cached re-read: caching saves money on the
     * hosted path, but a local run genuinely processes it twice.
     */
    estimatedDurationMs:
      provider.id === "local"
        ? estimateLocalDurationMs(inputTokens * (secondCallLikely ? 2 : 1), estimatedOutputTokens)
        : undefined,
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
/**
 * How much of the window to leave for the model's own answer.
 *
 * Extraction is the long output - a face-off returns every platform and mode -
 * so this is deliberately generous. The measured worst case left ~10,900
 * tokens spare with markers on, and succeeded.
 */
const EXTRACTION_OUTPUT_HEADROOM_TOKENS = 8000;

/**
 * Transcript markers if they fit, plain text if they do not.
 *
 * A context-budget question, answered by counting the tokens rather than by
 * guessing from duration. Duration is a poor proxy: token density per minute
 * runs *inversely* to length - a short, densely-spoken preview measured 576
 * tokens per minute against 282 for a feature-length Direct - so the longest
 * video is not reliably the tightest fit.
 */
const chooseExtractionPrompt = async (
  provider: AiProvider,
  prepared: PreparedCall,
  contentType: WireContentType,
  plainInstruction: string
): Promise<{ content: string; instruction: string }> => {
  const plain = { content: prepared.content, instruction: plainInstruction };
  if (!prepared.contentMarked || !provider.usesTranscriptMarkers) {
    return plain;
  }
  // The marked instruction explains the markers, so it is what must be sized -
  // measuring the plain one would under-count what actually gets sent.
  const instruction = buildExtractionInstruction(contentType, {
    ...prepared.flags,
    hasMarkers: true,
    needsQuoteCoverage: provider.usesQuoteCoverageClause,
  });
  if (!instruction) {
    return plain;
  }
  const marked = { content: prepared.contentMarked, instruction };
  if (!provider.contextTokens) {
    return marked;
  }
  try {
    const tokens = await provider.countInputTokens(prepared.system, marked.content, marked.instruction);
    if (tokens + EXTRACTION_OUTPUT_HEADROOM_TOKENS <= provider.contextTokens) {
      return marked;
    }
    logger.log(
      "info",
      `Transcript position markers would need ${tokens} prompt tokens against a ${provider.contextTokens} window, so they were left out for this one. Findings will still be located, just slightly less often.`
    );
  } catch (e) {
    // Counting is a convenience, not a requirement - fall back to the form
    // that certainly fits rather than failing the analysis over it.
    logger.log("debug", `Could not size the marked prompt, using the plain transcript: ${e}`);
  }
  return plain;
};

const extractStructuredData = async (
  provider: AiProvider,
  config: AiAnalysisConfig,
  prepared: PreparedCall,
  contentType: WireContentType,
  onProgress?: (progress: { outputTokens: number }) => void
): Promise<{ data?: AiStructuredData; usage?: AiAnalysisUsage }> => {
  const plainInstruction = buildExtractionInstruction(contentType, {
    ...prepared.flags,
    needsQuoteCoverage: provider.usesQuoteCoverageClause,
  });
  if (!plainInstruction) {
    return {};
  }
  const { content, instruction } = await chooseExtractionPrompt(provider, prepared, contentType, plainInstruction);
  try {
    switch (contentType) {
      case "platform_tech_review": {
        const { parsed, usage } = await provider.callStructured(
          WirePlatformTechReview, prepared.system, content, instruction, onProgress
        );
        return {
          data: {
            contentType: "platform_tech_review",
            game: parsed.game,
            developer: parsed.developer,
            platforms: parsed.platforms,
            changeSummary: parsed.changeSummary,
            knownIssues: parsed.knownIssues,
            recommendation: parsed.recommendation,
          },
          usage,
        };
      }
      case "pc_review_settings": {
        const { parsed, usage } = await provider.callStructured(
          WirePcReviewSettings, prepared.system, content, instruction, onProgress
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

      case "hands_on_preview": {
        const { parsed, usage } = await provider.callStructured(
          WirePreview, prepared.system, content, instruction, onProgress
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
        const { parsed, usage } = await provider.callStructured(
          WireHardwareReview, prepared.system, content, instruction, onProgress
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
      case "roundup_list":
      case "interview": {
        const { parsed, usage } = await provider.callStructured(
          WireQaSegments, prepared.system, content, instruction, onProgress
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
/**
 * What extraction actually produced, in one line.
 *
 * Counts every list on the payload rather than naming fields per content type,
 * so a new schema describes itself without this needing to be revisited. The
 * numbers are the useful part - "4 platforms" against "0 platforms" is the
 * difference between a good run and a silently empty one.
 */
const describeStructuredData = (data: AiStructuredData): string => {
  const lists = Object.entries(data)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => `${(value as unknown[]).length} ${key}`);
  return lists.length ? lists.join(", ") : "no list fields";
};

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
    /*
     * The configured model until a provider is resolved, then whatever
     * actually answered - see below. Only the failure path that never got a
     * provider keeps this value, where naming the engine that was asked for
     * is the most honest thing available.
     */
    model: config.model as string,
    tags: [] as AiTagSuggestion[],
    evidence: [] as AiEvidenceSource[],
    // Present even on the failure paths: a stored result with no games is a
    // truthful "covers nothing", where a missing field would be indistinguishable
    // from a record written before the field existed.
    games: [] as string[],
  };

  let provider: AiProvider;
  try {
    provider = makeProvider(config, inputs.provider);
  } catch (e) {
    return { ...base, contentType: "other", error: e instanceof Error ? e.message : String(e) };
  }
  // What answered, not what is configured: a local run recording a Claude
  // model name would misattribute it in the per-model spend table.
  base.model = provider.model;

  const prepared = await prepareAnalysis(config, inputs);
  const autoApply = config.features.tagging.applyMode === "auto_apply";

  try {
    if (prepared.tagsOnly) {
      // One call, so the plan is one entry - said anyway, so a consumer never
      // has to special-case "no plan was announced".
      inputs.onPlan?.([{ name: PHASE_LABELS.tagsOnly, weight: 1 }]);
      inputs.onStage?.({ step: 1, of: 1, label: PHASE_LABELS.tagsOnly });
      const { parsed, usage } = await provider.callStructured(
          WireTagOnly, prepared.system, prepared.content, buildTagOnlyInstruction(config)
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

    /*
     * Two call plans, chosen by the engine - see AiProvider.separatesClassification.
     *
     * A hosted model classifies, summarises and tags in one call perfectly
     * well. A local one, given all three at once, quietly drops most of the
     * summary: on a Q+A it wrote 509 characters and no conclusion, against
     * 1,484 and a 681-character conclusion when classification was taken
     * away - and over six items the combined call left the conclusion empty
     * four times where the split call left it empty once. So it gets a cheap
     * transcript-free classify call first.
     *
     * This buys quality, not speed - it roughly doubles overview latency,
     * because the extra prose costs more than the tiny classify call saves.
     */
    let overview: WireOverview;
    let usage: AiAnalysisUsage;

    /*
     * Assumes the extraction call happens, which it may not - whether a type
     * is extractable is only known once classification has run. The cost
     * estimate makes the same assumption for the same reason, and erring
     * towards "one more step" is the right way round: a run that finishes a
     * step early is a better surprise than one that grows a step.
     */
    const totalSteps = (provider.separatesClassification ? 2 : 1) + (config.features.structuredData ? 1 : 0);
    /*
     * Weighted rather than even. Without the classify call its share folds into
     * the summary, which is what the hosted path does in one call anyway.
     */
    const weights = provider.separatesClassification
      ? [LOCAL_CALL_WEIGHTS.classify, LOCAL_CALL_WEIGHTS.summarise, LOCAL_CALL_WEIGHTS.extract]
      : [LOCAL_CALL_WEIGHTS.classify + LOCAL_CALL_WEIGHTS.summarise, LOCAL_CALL_WEIGHTS.extract];
    /*
     * Announced before the first call, so a consumer can lay out the whole run
     * rather than discovering it a call at a time. The names match exactly
     * what reportStage sends below, which is the contract.
     */
    const plannedPhases: { name: string; weight: number }[] = provider.separatesClassification
      ? [
          { name: PHASE_LABELS.classify, weight: weights[0] },
          { name: PHASE_LABELS.summarise, weight: weights[1] },
        ]
      : [{ name: PHASE_LABELS.overview, weight: weights[0] }];
    if (config.features.structuredData) {
      plannedPhases.push({ name: PHASE_LABELS.extract, weight: weights[weights.length - 1] });
    }
    inputs.onPlan?.(plannedPhases);
    let stage: AnalysisStage | undefined;
    const reportStage = (step: number, label: string) => {
      /*
       * How far along the run is used to be computed here as well, from these
       * same weights, and nothing ever read it. The weights now travel with
       * the plan instead, so whatever shows progress divides by them once
       * rather than each consumer being handed a number derived twice.
       */
      stage = { step, of: totalSteps, label };
      inputs.onStage?.(stage);
    };
    /** Re-reports the current stage with the tokens generated so far. */
    const reportTokens = ({ outputTokens, waiting }: { outputTokens: number; waiting?: boolean }) => {
      if (!stage) {
        return;
      }
      // A wait carries no token count - nothing has been generated yet - so the
      // count is left off rather than reported as a genuine zero.
      inputs.onStage?.(waiting === undefined ? { ...stage, outputTokens } : { ...stage, waiting });
    };

    if (provider.separatesClassification) {
      reportStage(1, PHASE_LABELS.classify);
      const forClassify = await prepareAnalysis(config, {
        ...inputs,
        sources: { ...(inputs.sources ?? config.sources), transcript: false },
      });
      const classified = await provider.callStructured(
        WireClassification,
        forClassify.system,
        forClassify.content,
        buildClassificationInstruction(),
        reportTokens
      );
      logPhaseOutput(inputs.entry.key, PHASE_LABELS.classify, classified.parsed);
      inputs.onPhaseOutcome?.(
        PHASE_LABELS.classify,
        `${classified.parsed.contentType} (${Math.round((classified.parsed.contentTypeConfidence ?? 0) * 100)}% sure)`,
        [
          { label: "Content type", value: classified.parsed.contentType },
          { label: "Confidence", value: `${Math.round((classified.parsed.contentTypeConfidence ?? 0) * 100)}%` },
        ]
      );
      logger.log(
        "info",
        `Analysis ${inputs.entry.key} classified as ${classified.parsed.contentType} (confidence ${classified.parsed.contentTypeConfidence})`
      );
      reportStage(2, PHASE_LABELS.summarise);
      const summarised = await provider.callStructured(
        WireSummary,
        prepared.system,
        prepared.content,
        buildSummaryInstruction(config),
        reportTokens
      );
      logPhaseOutput(inputs.entry.key, PHASE_LABELS.summarise, summarised.parsed);
      inputs.onPhaseOutcome?.(
        PHASE_LABELS.summarise,
        describeOverviewOutcome(summarised.parsed),
        overviewOutputFields(summarised.parsed)
      );
      overview = { ...classified.parsed, ...summarised.parsed };
      usage = addUsage(classified.usage, summarised.usage);
    } else {
      reportStage(1, PHASE_LABELS.overview);
      const summarised = await provider.callStructured(
        WireOverview,
        prepared.system,
        prepared.content,
        buildOverviewInstruction(config),
        reportTokens
      );
      logPhaseOutput(inputs.entry.key, PHASE_LABELS.overview, summarised.parsed);
      inputs.onPhaseOutcome?.(
        PHASE_LABELS.overview,
        `${summarised.parsed.contentType}, ${describeOverviewOutcome(summarised.parsed)}`,
        [{ label: "Content type", value: summarised.parsed.contentType }, ...overviewOutputFields(summarised.parsed)]
      );
      overview = summarised.parsed;
      usage = summarised.usage;
    }

    logger.log(
      "info",
      `Analysis ${inputs.entry.key} overview: game ${overview.primaryGame ?? "none"}, ` +
        `summary ${overview.summary?.length ?? 0} chars, conclusion ${overview.conclusion?.length ?? 0} chars, ` +
        `${overview.tags?.length ?? 0} tag(s)`
    );

    let structuredData: AiStructuredData | undefined;

    if (config.features.structuredData && EXTRACTABLE_TYPES.includes(overview.contentType)) {
      reportStage(totalSteps, PHASE_LABELS.extract);
      const extraction = await extractStructuredData(provider, config, prepared, overview.contentType, reportTokens);
      logPhaseOutput(inputs.entry.key, PHASE_LABELS.extract, extraction.data);
      inputs.onPhaseOutcome?.(
        PHASE_LABELS.extract,
        extraction.data ? describeStructuredData(extraction.data) : "nothing extracted",
        extraction.data
          ? [{ label: "Extracted", value: JSON.stringify(extraction.data, null, 2), long: true }]
          : undefined
      );
      structuredData = extraction.data ? anchorFindings(extraction.data, prepared.transcript, prepared.articleText) : undefined;
      logger.log(
        "info",
        structuredData
          ? `Analysis ${inputs.entry.key} extracted ${overview.contentType}: ${describeStructuredData(structuredData)}`
          : `Analysis ${inputs.entry.key} extracted nothing for ${overview.contentType}`
      );
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
    /*
     * A run that produced nothing is a failure, not a result.
     *
     * Recorded as an error specifically so it does not block a retry: a stored
     * result without an error is treated as "already analysed" and skipped by
     * every later scheduled or bulk run, so a blank one is not merely useless -
     * it is permanent until someone forces a re-analysis by hand.
     *
     * Seen for real: a night of scheduled runs where every item came back
     * classified the same and with nothing written, which is what degenerate
     * model output looks like from the outside. Whatever the cause, storing it
     * as a success is the part that turned a bad night into a stuck library.
     *
     * Deliberately narrow. Only applies when a summary was actually asked for,
     * and needs BOTH halves empty - a short video legitimately yields no
     * conclusion, and a tags-only run has neither by design and never reaches
     * here.
     */
    if (config.features.summary && !result.summary?.trim() && !result.conclusion?.trim()) {
      const message = `${provider.model} returned an empty summary and conclusion - treating as failed rather than storing a blank analysis`;
      logger.log("error", `AI analysis produced nothing for ${inputs.entry.key}: ${message}`);
      return { ...base, contentType: "other", evidence: prepared.evidence, error: message };
    }
    logAnalysisOutcome(inputs.entry.key, result, started);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.log("error", `AI analysis failed for ${inputs.entry.key}: ${message}`);
    return { ...base, contentType: "other", evidence: prepared.evidence, error: message };
  }
};
