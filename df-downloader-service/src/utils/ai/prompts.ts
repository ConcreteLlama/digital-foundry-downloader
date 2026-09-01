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

const CONTENT_TYPES = `- console_comparison: a technical comparison of one game across two or more consoles - per-platform resolutions, frame rates, and modes.
- platform_analysis: one game examined on a single platform, or a small number, outside a full face-off - a port, a patch, an upgrade, a "have they fixed it yet" revisit, a single-platform review. Choose this over console_comparison when the point is that game on that hardware rather than a comparison between platforms.
- pc_review_settings: a PC technical review OF A GAME, usually with per-setting performance analysis and recommended "optimised settings". The subject is the game; the PC is what it is being run on.
- hands_on_preview: an early look at unreleased or just-revealed content, typically hedged and provisional.
- game_retrospective: a look back at an older game, or an anniversary re-release.
- hardware_review: a review or test OF A PIECE OF HARDWARE - a graphics card, CPU, handheld, display or complete machine. Games appearing in it are benchmarks, not the subject.
  Decide between this and pc_review_settings by asking what is being reviewed, not by what is discussed. A graphics card review talks about PC performance, frame rates and quality settings at length and still is not a PC game review: its subject is the card. If the title names a product rather than a game, it is hardware_review.
- tech_explainer: a piece about a technology rather than a product - upscaling, ray tracing, frame generation, an engine feature.
- interview: a conversation with developers, or a behind-the-scenes piece built around one.
- qa_roundtable: a Q+A show answering viewer questions across unrelated topics.
- news_discussion: a news or discussion show moving through several unrelated items - a Direct, a showcase reaction.
- roundup_list: a year-end list, best-of or worst-of covering many games at once.
- other: anything that genuinely does not match the above.`;

/**
 * How the two game fields get filled, for every content type.
 *
 * Asked on the first call rather than during extraction, so types with no
 * structured payload still get filed under their game. The split is the
 * point: forcing a primary game onto a Direct would invent a subject it does
 * not have, while treating a Direct as gameless throws away the only record
 * this tool holds of what was said about the games it covered.
 */
const GAME_IDENTIFICATION = `Identify the games this video covers, in two separate fields.

The video's title is the most reliable source for which game is the subject, and it usually names it outright. Prefer it over the transcript: the transcript is machine-generated, garbles titles, and frequently discusses other games - including earlier entries in the same series - while the video itself is about the one in the title. A preview titled "Metro 2039" is about Metro 2039 even if the presenters mention Metro Exodus repeatedly. Only override the title when the video's content plainly contradicts it.

"primaryGame": the single game the video is about, or null. Most Digital Foundry content is about exactly one game - a tech review, a port or patch analysis, a hands-on, a retrospective - and this should name it. Set it to null when there is no single subject: a Direct or Q+A moves between unrelated items, a hardware review is about hardware, and a year-end list is about many games at once. Do not promote one of several games to primary just because it came first or was discussed longest.

"games": every game the video actually covers, including primaryGame when it is set. Covering a game means it is the subject of the video or of one of its items - a news story about it, a segment discussing it, an entry in a list. It is a high bar and most videos clear it only once or twice.

Be strict about this. Do NOT include a game that is mentioned as an example, a comparison, a bit of history, or an aside - "it stutters the way Jedi Survivor did", "back when Ridge Racer did this on PS3". A discussion show name-drops many titles it is not covering, and listing those files the video under games it barely mentions, which is worse than listing none. If you would not expect someone searching for that game to want this video, leave it out. Leave the array empty when no specific game is covered.

Write each name as it would normally be written, not as the transcript renders it - transcription garbles titles badly, so "Crisis" is Crysis, "Elden Ring" may arrive misspelt, and numbers get mangled. Exclude games used purely as benchmarks in a hardware review: those are instruments, not coverage.`;

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
  const sections = [`Classify this video as exactly one of:\n${CONTENT_TYPES}`, GAME_IDENTIFICATION];

  if (config.features.summary) {
    sections.push(
      `Write a detailed summary: name the specific numbers, settings, platforms and verdicts the video gives, rather than describing it in general terms. "Performance was better on PS5 Pro" is a bad summary; "PS5 Pro holds 60fps in the mode where the base PS5 drops to the low 50s" is a good one.`,
      `Write the conclusion - the overall verdict or takeaway - as a separate field from the summary, not folded into it. Set it to null if the video genuinely does not reach one; hands-on previews in particular often say outright that it is too early to judge, and when they do, null is the honest answer.`,
      `Break the summary into short paragraphs, separated by a blank line, one per distinct point. A single unbroken block is hard to read at any length, and these are read on a phone as often as not.`,
      `Where the classification you just made means a structured breakdown gets extracted separately - the per-platform table for a comparison, the settings list for a PC review, the topic-by-topic breakdown for a discussion show - say what the video covers and what it concludes, and leave the item-by-item detail to that breakdown. It is displayed beside this summary, so walking through every topic again in prose produces a wall of text restating what the reader can already see.`
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
 * Types with no extractable structure return "" and never make the call.
 * hands_on_preview now does make it, but deliberately asks for no numbers:
 * the earlier reasoning - that tabulating provisional impressions
 * manufactures precision the source does not have - was right about the
 * figures and wrong about the game, which is unambiguous and was being
 * dropped along with them.
 */
/**
 * Asks each finding to cite itself.
 *
 * Appended to every extraction instruction rather than written into each,
 * because the wording is load-bearing and should not drift between content
 * types. This exact phrasing was measured over a face-off and a discussion
 * show: twenty-five findings, every quote returned found verbatim in the
 * transcript, none paraphrased.
 *
 * The two things doing the work are "character for character" and the
 * explicit permission to answer null. Softening either invites a tidied-up
 * near-quote, which cannot be located and is therefore worse than nothing.
 */
const QUOTE_INSTRUCTION = [
  `For each item also set "quote": a span of 8 to 20 words copied EXACTLY from the transcript, character for character, at the point where that item is stated. Do not paraphrase, correct, summarise or re-punctuate it - it has to appear in the transcript verbatim, because it gets located by searching for it.`,
  `Set quote to null if there is no exact span to copy - for example when the item comes from the article rather than the video, or when you are summarising something said across several places. A null is expected and fine; an approximated quote is not, because it silently fails to locate.`,
].join(" ");

export const buildExtractionInstruction = (contentType: WireContentType): string => {
  switch (contentType) {
    case "console_comparison":
      return `Extract the per-platform technical comparison. For each platform covered, record each display/performance mode it offers, with the resolution as described (including upscaling where stated), the target frame rate, and the measured average frame rate if one is actually given. Record known bugs, crashes or performance problems the video calls out, and the overall platform recommendation. Remember that an unstated number is null, not an estimate.

${QUOTE_INSTRUCTION}`;
    case "pc_review_settings":
      return `Extract the PC settings analysis. For each graphics setting discussed, record the levels tested, the performance cost as a percentage if one is actually stated, any console-equivalent comparison made, and the recommended level. Record the main performance bottleneck if the video identifies one, and the before/after result of the optimised settings if it gives one. A setting described only qualitatively ("barely costs anything") has a null percentage - do not convert words into a number.

${QUOTE_INSTRUCTION}`;
    case "platform_analysis":
      return `Extract the technical analysis of this game. For each platform covered, record each display or performance mode, with the resolution as described (including upscaling where stated), the target frame rate, and the measured average frame rate only if one is actually given. Where the video is about a change - a patch, a port, a revisit, a new platform version - record what changed in changeSummary, since that delta is usually the point of the piece rather than the raw numbers. Record known bugs or performance problems it calls out, and the overall verdict. Remember that an unstated number is null, not an estimate.

${QUOTE_INSTRUCTION}`;
    case "hands_on_preview":
      return `Record what was actually shown, not what it might mean. Name the game, the platforms it was seen running on, and what kind of build it was - preview build, beta, demo, near-final - if the video says. List concrete observations rather than general impressions where the video supports them. Put whatever the presenters explicitly said not to conclude yet into caveats.

Do not produce performance figures here even if some are mentioned in passing. This format is provisional by design, and a number from an early build implies a precision nobody claimed.

${QUOTE_INSTRUCTION}`;
    case "hardware_review":
      return `Extract the hardware under review. For each product, record its name, what class of thing it is (GPU, CPU, handheld, display, complete machine), and the verdict reached on it specifically. Record the overall verdict separately, and any known issues or caveats raised.

Record the games used as benchmarks in gamesTested. These are test instruments rather than subjects - the video is not coverage of those games, and they must not be presented as though it were.

${QUOTE_INSTRUCTION}`;
    case "news_discussion":
      return `Break this show into its distinct items, in order. For each, give the topic, and set "game" to the specific game it is about, or null where the item is not about one - a hardware rumour, an industry story. Give a summary of what was said and the conclusion reached, or null where the participants disagreed or left it open, which is common and should not be smoothed over into false agreement.

Getting "game" right matters more here than anywhere else: this is frequently the only record of what Digital Foundry said about that title, and an item filed under no game is invisible.

${QUOTE_INSTRUCTION}`;
    case "roundup_list":
      return `Break this round-up into its entries, in order. For each, give the topic - the game or the category - set "game" to the title it concerns, and record the reasoning given for its inclusion as the summary, with the verdict or placement as the conclusion.

${QUOTE_INSTRUCTION}`;
    case "qa_roundtable":
      return `Break this discussion into its distinct topics, in order. For each, give the topic, a summary of what was said, and the conclusion reached - or null where the participants disagreed or left it open, which is common and should not be smoothed over into false agreement. Set "game" to the specific game a topic concerns, or null where it is not about one. Do not record who asked a question: usernames cannot be transcribed reliably and there is nothing to check them against.

${QUOTE_INSTRUCTION}`;
    default:
      return "";
  }
};

export const buildTagOnlyInstruction = (config: AiAnalysisConfig): string =>
  [
    `You are working from the title and description only - there is no transcript. Judge only what those support, and keep your confidence values low enough to reflect that.`,
    `Classify this video as exactly one of:\n${CONTENT_TYPES}`,
    GAME_IDENTIFICATION,
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
