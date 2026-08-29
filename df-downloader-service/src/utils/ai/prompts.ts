import { DfContentInfo } from "df-downloader-common";
import { AiAnalysisConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { Chapter } from "../chatpers.js";
import { looksLikeSponsorText, stripSponsorship } from "../youtube/sponsorship.js";
import { WireContentType } from "./wire-schemas.js";

/**
 * Prompts for the analysis calls.
 *
 * A note on what is deliberately *absent*: none of these prompts supply
 * game-specific, hardware-specific or studio-specific vocabulary. That
 * discipline is intentional and carried over from the transcription work -
 * priming a model with the answers you expect makes it likelier to report
 * them whether or not they were said. The model gets the content and the
 * schema; it does not get a list of things to find.
 *
 * ## Structure, and why it looks like this
 *
 * Analysis takes two calls (see wire-schemas.ts for the API limit that
 * forces it), and both send the same - potentially very large - transcript.
 * To avoid paying for that twice, the two calls are built to share a byte
 * identical prefix so the second reads it from cache:
 *
 *   system:  identical for both calls (role, null discipline, caveats)
 *   user[0]: the content itself - identical, marked cacheable
 *   user[1]: the task for this particular call - differs
 *
 * Caching is a prefix match, so anything that varies has to come last.
 * That is the only reason the per-call instruction sits after the
 * transcript rather than before it.
 */

const NULL_DISCIPLINE = `Leave a field null when the video does not actually state it. Never estimate, infer from what is typical, or fill a gap with a plausible-sounding value. A null is a correct answer; an invented number is not, and is worse than no answer at all because it looks equally trustworthy. Presenters often describe a difference in words without ever giving a figure - that is a null, not an invitation to derive one.`;

const TRANSCRIPT_CAVEAT = `The transcript is machine-generated and has not been corrected. It reliably mangles technical jargon, product names, studio names and settings tiers, and occasionally inserts or merges digits in numbers. Where a term is clearly a mis-transcription of something you can identify with confidence from context, use the correct form. Where you cannot identify it confidently, do not guess at a name - describe it in plain words instead, or leave the field null. Do not "correct" a term that is merely unfamiliar to you: newer hardware and newer games are frequently correct as transcribed, and silently rewriting a rare-but-correct model number into a more common one is a real and damaging failure.`;

const ARTICLE_PRECEDENCE = `You have both Digital Foundry's own written article and a machine transcript. Prefer the article for any name, spelling or figure the two disagree on - it was written, not transcribed, so it cannot contain a mishearing. Use the transcript for anything the article does not cover.`;

const CONTENT_TYPES = `- console_comparison: a technical comparison of one game across consoles - per-platform resolutions, frame rates, and modes.
- pc_review_settings: a PC technical review, usually with per-setting performance analysis and recommended "optimised settings".
- hands_on_preview: an early look at unreleased or just-revealed content, typically hedged and provisional.
- qa_roundtable: a discussion or Q+A show covering several unrelated topics in sequence.
- other: anything that does not clearly match the above - retrospectives, interviews, hardware reviews, and so on.`;

export type PromptFlags = { hasTranscript: boolean; hasArticle: boolean };

/**
 * The shared system prompt, identical across both calls of a run so the
 * cached prefix survives between them.
 */
export const buildSystemPrompt = (flags: PromptFlags): string => {
  const sections = [
    `You analyse Digital Foundry videos - technical games journalism covering graphics, performance and hardware. You produce accurate structured records of what a video actually said.`,
    NULL_DISCIPLINE,
  ];
  // Only warn about transcription errors when there is a transcript.
  // Included unconditionally it would invite "correcting" an article's
  // already-correct prose - the exact failure the caveat exists to prevent.
  if (flags.hasTranscript) {
    sections.push(TRANSCRIPT_CAVEAT);
  }
  if (flags.hasTranscript && flags.hasArticle) {
    sections.push(ARTICLE_PRECEDENCE);
  }
  return sections.join("\n\n");
};

const buildTaggingInstruction = (config: AiAnalysisConfig): string => {
  const base = `Suggest tags describing what the video covers - games, platforms, hardware, technologies and format. Prefer a small number of tags that would genuinely be useful for filtering a library later over an exhaustive list. Give each a confidence between 0 and 1, and be honest with it: judging a video from its title alone warrants lower confidence than reading its transcript.`;
  const addition = config.promptAdditions?.tagging?.trim();
  return addition ? `${base}\n\nThe user's own tagging conventions, which your suggestions should match:\n${addition}` : base;
};

/** Task instruction for call one: classify, summarise, tag. */
export const buildOverviewInstruction = (config: AiAnalysisConfig): string => {
  const sections = [`Classify this video as exactly one of:\n${CONTENT_TYPES}`];

  if (config.features.summary) {
    sections.push(
      `Write a detailed summary: name the specific numbers, settings, platforms and verdicts the video gives, rather than describing it in general terms. "Performance was better on PS5 Pro" is a bad summary; "PS5 Pro holds 60fps in the mode where the base PS5 drops to the low 50s" is a good one.`,
      `Write the conclusion - the overall verdict or takeaway - as a separate field from the summary, not folded into it. Set it to null if the video genuinely does not reach one; hands-on previews in particular often say outright that it is too early to judge, and when they do, null is the honest answer.`
    );
  } else {
    sections.push(`Set summary and conclusion to null - summarising is switched off.`);
  }

  sections.push(
    config.features.tagging.enabled
      ? buildTaggingInstruction(config)
      : `Return an empty tags array - tagging is switched off.`
  );

  if (config.promptAdditions?.summary?.trim()) {
    sections.push(`Additional instructions from the user:\n${config.promptAdditions.summary.trim()}`);
  }
  return sections.join("\n\n");
};

/**
 * Task instruction for call two, per content type.
 *
 * Only called for the three types that carry extractable structure -
 * hands_on_preview and other never reach here, by design: their real
 * content is hedged, exploratory opinion, and tabulating it would
 * manufacture precision the source does not have.
 */
export const buildExtractionInstruction = (contentType: WireContentType): string => {
  switch (contentType) {
    case "console_comparison":
      return `Extract the per-platform technical comparison. For each platform covered, record each display/performance mode it offers, with the resolution as described (including upscaling where stated), the target frame rate, and the measured average frame rate if one is actually given. Record known bugs, crashes or performance problems the video calls out, and the overall platform recommendation. Remember that an unstated number is null, not an estimate.`;
    case "pc_review_settings":
      return `Extract the PC settings analysis. For each graphics setting discussed, record the levels tested, the performance cost as a percentage if one is actually stated, any console-equivalent comparison made, and the recommended level. Record the main performance bottleneck if the video identifies one, and the before/after result of the optimised settings if it gives one. A setting described only qualitatively ("barely costs anything") has a null percentage - do not convert words into a number.`;
    case "qa_roundtable":
      return `Break this discussion into its distinct topics, in order. For each, give the topic, a summary of what was said, and the conclusion reached - or null where the participants disagreed or left it open, which is common and should not be smoothed over into false agreement. Do not record who asked a question: usernames cannot be transcribed reliably and there is nothing to check them against.`;
    default:
      return "";
  }
};

export const buildTagOnlyInstruction = (config: AiAnalysisConfig): string =>
  [
    `You are working from the title and description only - there is no transcript. Judge only what those support, and keep your confidence values low enough to reflect that.`,
    `Classify this video as exactly one of:\n${CONTENT_TYPES}`,
    buildTaggingInstruction(config),
  ].join("\n\n");

export type PromptContext = {
  contentInfo: DfContentInfo;
  transcript?: string;
  chapters?: Chapter[];
  /** Text of a matching Digital Foundry article, when one was found. */
  articleText?: string;
};

const formatTimestamp = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Chapter boundaries as segmentation scaffolding.
 *
 * Titles are passed as explicitly unverified hints rather than as fact.
 * They are written for a YouTube audience, are sometimes cute rather than
 * descriptive, and can carry promotional content - useful for anticipating
 * where a section starts, actively misleading if treated as a statement of
 * what it contains. Anything reading as a sponsor credit is dropped: the
 * dedicated sponsor chapter is normally removed upstream by
 * applySponsorSegmentToChapters, so this covers what that misses.
 */
const formatChapters = (chapters: Chapter[]): string => {
  const usable = chapters.filter((chapter) => chapter.title && !looksLikeSponsorText(chapter.title));
  if (!usable.length) {
    return "";
  }
  const lines = usable.map((chapter) => `- ${formatTimestamp(chapter.start)} ${chapter.title}`);
  return [
    `Chapter markers, for locating sections only. These titles come from the video's own metadata and are NOT verified: they may be vague, promotional, or a poor description of the section. Use them to anticipate structure, never as evidence of what was said, and do not reproduce them verbatim as findings.`,
    ...lines,
  ].join("\n");
};

/**
 * The content block - identical across both calls of a run, which is what
 * makes it cacheable. Nothing call-specific may go in here.
 */
export const buildContentBlock = (context: PromptContext): string => {
  const { contentInfo, transcript, chapters, articleText } = context;
  const parts: string[] = [`TITLE: ${contentInfo.title}`];

  const description = contentInfo.description ? stripSponsorship(contentInfo.description) : "";
  if (description) {
    parts.push(`DESCRIPTION:\n${description}`);
  }

  // Before the transcript deliberately: it is the higher-quality source,
  // and saying so up front frames how the transcript should be read.
  if (articleText) {
    parts.push(
      `DIGITAL FOUNDRY ARTICLE - Digital Foundry's own written companion piece for this video. It is written text, not a transcript, so its terminology, product names and figures are correct as written. Note it is written by a different author than the presenter and may cover slightly different ground.\n\n${articleText}`
    );
  }

  if (chapters?.length) {
    const formatted = formatChapters(chapters);
    if (formatted) {
      parts.push(formatted);
    }
  }

  if (transcript) {
    parts.push(`TRANSCRIPT (machine-generated, uncorrected):\n${transcript}`);
  }

  return parts.join("\n\n");
};

export const buildTagOnlyContentBlock = (contentInfo: DfContentInfo): string => {
  const parts = [`TITLE: ${contentInfo.title}`];
  const description = contentInfo.description ? stripSponsorship(contentInfo.description) : "";
  if (description) {
    parts.push(`DESCRIPTION:\n${description}`);
  }
  return parts.join("\n\n");
};
