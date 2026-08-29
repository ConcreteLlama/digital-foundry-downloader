import { logger } from "df-downloader-common";
import type { Chapter } from "../chatpers.js";

/**
 * Digital Foundry's YouTube uploads carry a sponsor read that their own
 * downloadable files don't. Two separate consequences, both handled here:
 *
 * 1. The *description* opens with a sponsor blurb (see
 *    `moveSponsorshipToEnd`) that isn't really about the video.
 * 2. The *timeline* is longer than the downloaded file, so YouTube-sourced
 *    chapters drift out of sync with it (see `resolveSponsorSegment` and
 *    `applySponsorSegmentToChapters`). Subtitles used to need the same
 *    correction, but are now transcribed from the downloaded file itself
 *    (see media-utils/subtitles/whisper.ts) and are correct by construction.
 *
 * Both are best-effort pattern matching against how DF happen to write
 * these today, so everything here is written to fail closed: when a
 * pattern doesn't match we leave the data exactly as YouTube gave it,
 * rather than guessing.
 */

/**
 * Sponsor blurbs sit in their own leading paragraph and read like a credit
 * line - "Many thanks to Green Man Gaming for sponsoring this video - ...",
 * "Thanks to Alienware for sponsoring our PC performance reviews. ...",
 * "Thanks to MSI for sponsoring this video. ...". Each pattern demands that
 * credit-line shape rather than just the word "sponsor", so a video whose
 * actual subject matter mentions sponsorship isn't caught.
 */
const SPONSOR_PARAGRAPH_PATTERNS = [
  // "Many thanks to X for sponsoring this video/DF Direct/our PC reviews..."
  /\b(?:many\s+)?thanks?\s+(?:to|go\s+to)\s+\S[^.!?\n]{0,60}?\s+for\s+sponsoring\b/i,
  // "This video/episode is sponsored by X"
  /\bthis\s+(?:video|episode|direct|review)\s+is\s+sponsored\s+by\b/i,
  // A bare "Sponsored by X" lead-in.
  /^\s*sponsored\s+by\b/i,
];

/**
 * Only the opening paragraphs are considered - DF always lead with the
 * sponsor line, and scanning the whole description would risk matching real
 * content further down.
 */
const SPONSOR_PARAGRAPH_SEARCH_DEPTH = 3;

/**
 * Sponsor blurbs are a sentence or two plus a link. Anything substantially
 * longer is far more likely to be real content that merely happens to match,
 * so it's left alone.
 */
const MAX_SPONSOR_PARAGRAPH_LENGTH = 400;

const isSponsorParagraph = (paragraph: string) => {
  if (paragraph.length > MAX_SPONSOR_PARAGRAPH_LENGTH) {
    return false;
  }
  return SPONSOR_PARAGRAPH_PATTERNS.some((pattern) => pattern.test(paragraph));
};

/**
 * Moves a leading sponsor blurb to the end of the description rather than
 * deleting it, so the description opens with what the video is actually
 * about while the sponsor still gets their mention. Nothing is ever
 * discarded - a false positive costs a paragraph its position, not its
 * existence.
 */
/**
 * Whether a line reads as a sponsor credit rather than content.
 *
 * Exported for the AI analysis prompts, which pass chapter titles through
 * it before including them as context. DF's dedicated "Sponsored by X"
 * chapter is normally dropped upstream by applySponsorSegmentToChapters,
 * so this is the cheap second line of defence for the cases that fix
 * doesn't cover - a title that carries a sponsor mention without being a
 * dedicated sponsor chapter.
 */
export const looksLikeSponsorText = (text: string) => isSponsorParagraph(text.trim());

/**
 * Removes a leading sponsor blurb outright, rather than relocating it.
 *
 * Deliberately distinct from moveSponsorshipToEnd, which exists for
 * *display* - there the blurb is still something the user might want to
 * see, so nothing is discarded. For prompt context the concern is the
 * opposite: the sponsor read was cut from the downloaded file, has nothing
 * to do with the video's subject, and spending input tokens on it only
 * invites the model to mention a sponsor in a summary of content that
 * never contained one. Two different needs that happen to share one
 * detection routine.
 */
export const stripSponsorship = (description: string): string => {
  if (!description?.trim()) {
    return description;
  }
  const paragraphs = description.split(/\n\s*\n/);
  const searchDepth = Math.min(SPONSOR_PARAGRAPH_SEARCH_DEPTH, paragraphs.length);
  const kept = paragraphs.filter((paragraph, index) => index >= searchDepth || !isSponsorParagraph(paragraph.trim()));
  return kept.join("\n\n").trim();
};

export const moveSponsorshipToEnd = (description: string): string => {
  if (!description?.trim()) {
    return description;
  }
  // Blank-line separated blocks, keeping each block's own internal newlines.
  const paragraphs = description.split(/\n\s*\n/);
  const searchDepth = Math.min(SPONSOR_PARAGRAPH_SEARCH_DEPTH, paragraphs.length);
  const sponsorIndices: number[] = [];
  for (let i = 0; i < searchDepth; i++) {
    if (isSponsorParagraph(paragraphs[i].trim())) {
      sponsorIndices.push(i);
    }
  }
  if (!sponsorIndices.length) {
    return description;
  }
  // Everything after the last paragraph we're moving has to stay put, so
  // rebuild rather than splice - this keeps relative order of both the kept
  // paragraphs and the moved ones.
  const moved = sponsorIndices.map((i) => paragraphs[i].trim());
  const kept = paragraphs.filter((_paragraph, i) => !sponsorIndices.includes(i));
  const keptText = kept.join("\n\n").trim();
  if (!keptText) {
    // The sponsor blurb was the entire description - moving it would
    // achieve nothing and leave the description empty.
    return description;
  }
  return [keptText, ...moved].join("\n\n");
};

export type SponsorSegment = {
  title: string;
  /** Offset into YouTube's timeline where the sponsor read starts, in ms. */
  startMs: number;
  /** Offset into YouTube's timeline where it ends, in ms. */
  endMs: number;
  durationMs: number;
};

/**
 * DF mark the sponsor read with its own chapter, always titled "Sponsored
 * by <sponsor>". That chapter is what makes a precise correction possible
 * at all: it gives both the length of the missing segment *and* where in
 * the timeline it sits. That position matters - the sponsor read is never
 * at 0:00 (observed between 0:29 and 2:26 in), it follows a short intro, so
 * the excision is mid-video and everything before it is already correctly
 * aligned with the downloaded file.
 */
const findSponsorChapter = (chapters: Chapter[], ytDurationMs: number): SponsorSegment | null => {
  const matches = chapters.filter((chapter) => /\bsponsor(?:ed|ship)?\b/i.test(chapter.title || ""));
  if (matches.length !== 1) {
    // No sponsor chapter, or an ambiguous set of them - either way there's
    // no single segment we can confidently say was cut.
    return null;
  }
  const sponsor = matches[0];
  const index = chapters.indexOf(sponsor);
  const next = chapters[index + 1];
  const endMs = next ? next.start : ytDurationMs;
  const durationMs = endMs - sponsor.start;
  if (durationMs <= 0) {
    return null;
  }
  return { title: sponsor.title, startMs: sponsor.start, endMs, durationMs };
};

/**
 * How far the measured duration gap may differ from the sponsor chapter's
 * own length before we stop believing the two describe the same cut. If
 * they disagree, DF trimmed something we haven't accounted for and any
 * shift we applied would be wrong by an unknown amount.
 */
const DURATION_MATCH_TOLERANCE_S = 10;

/**
 * Below this, the difference is rounding (YouTube reports whole seconds,
 * ffprobe doesn't) rather than a real cut. Matches the threshold the
 * subtitle generator has always used.
 */
const SIGNIFICANT_DRIFT_S = 5;

export type SponsorSegmentResolution =
  /** The file matches YouTube's timeline; nothing to correct. */
  | { kind: "aligned" }
  /** A cut was measured and pinned to a specific segment. */
  | { kind: "located"; segment: SponsorSegment }
  /** A cut was measured but we can't say where it is - correct nothing. */
  | { kind: "unlocated"; driftSeconds: number };

/**
 * Decides whether YouTube's timeline can be mapped onto the downloaded
 * file, using the file's *own* ffprobe-measured duration as the reference.
 *
 * `measuredDurationSeconds` must be a real measurement of the file on disk.
 * Passing YouTube's own duration here makes the comparison compare YouTube
 * against itself and silently resolve to "aligned" for every video - which
 * is exactly the bug this replaced (see docs/ROADMAP.md's Phase 3).
 */
export const resolveSponsorSegment = (opts: {
  chapters: Chapter[] | null;
  ytDurationSeconds: number | null;
  measuredDurationSeconds: number | null;
  label?: string;
}): SponsorSegmentResolution => {
  const { chapters, ytDurationSeconds, measuredDurationSeconds, label = "content" } = opts;
  if (!ytDurationSeconds || !measuredDurationSeconds) {
    return { kind: "aligned" };
  }
  const driftSeconds = ytDurationSeconds - measuredDurationSeconds;
  if (driftSeconds < SIGNIFICANT_DRIFT_S) {
    if (driftSeconds < -SIGNIFICANT_DRIFT_S) {
      logger.log(
        "warn",
        `${label}: downloaded file is ${-driftSeconds}s longer than YouTube's version - not something a stripped sponsor segment explains, leaving YouTube metadata untouched`
      );
    }
    return { kind: "aligned" };
  }
  const segment = chapters?.length ? findSponsorChapter(chapters, ytDurationSeconds * 1000) : null;
  if (!segment) {
    logger.log(
      "warn",
      `${label}: downloaded file is ${driftSeconds}s shorter than YouTube's version, but no sponsor chapter identifies where the cut is - leaving chapters and subtitles unshifted rather than guessing`
    );
    return { kind: "unlocated", driftSeconds };
  }
  const segmentSeconds = segment.durationMs / 1000;
  if (Math.abs(driftSeconds - segmentSeconds) > DURATION_MATCH_TOLERANCE_S) {
    logger.log(
      "warn",
      `${label}: measured a ${driftSeconds}s gap against YouTube but the "${segment.title}" chapter is ${segmentSeconds}s - they don't agree, so something else was cut too. Leaving chapters and subtitles unshifted.`
    );
    return { kind: "unlocated", driftSeconds };
  }
  logger.log(
    "info",
    `${label}: downloaded file is ${driftSeconds}s shorter than YouTube's, matching the "${segment.title}" chapter at ${
      segment.startMs / 1000
    }s - shifting YouTube metadata past that point back by ${segmentSeconds}s`
  );
  return { kind: "located", segment };
};

/**
 * Rewrites YouTube's chapters onto the downloaded file's timeline: chapters
 * before the sponsor read keep their timings (that part of the file is
 * untouched), the sponsor chapter itself is dropped, and everything after
 * it moves earlier by the segment's length.
 */
export const applySponsorSegmentToChapters = (
  chapters: Chapter[],
  segment: SponsorSegment,
  measuredDurationMs?: number
): Chapter[] => {
  const shifted = chapters.reduce<Chapter[]>((toReturn, chapter) => {
    if (chapter.start >= segment.startMs && chapter.start < segment.endMs) {
      // The sponsor chapter itself - no longer present in the file.
      return toReturn;
    }
    if (chapter.start < segment.startMs) {
      // Ahead of the cut, so already aligned - but don't let it run past
      // the cut point.
      toReturn.push({ ...chapter, end: Math.min(chapter.end, segment.startMs) });
      return toReturn;
    }
    toReturn.push({
      ...chapter,
      start: chapter.start - segment.durationMs,
      end: chapter.end - segment.durationMs,
    });
    return toReturn;
  }, []);
  if (!measuredDurationMs) {
    return shifted;
  }
  // YouTube's last chapter ends at YouTube's duration, which overshoots the
  // real file.
  return shifted
    .filter((chapter) => chapter.start < measuredDurationMs)
    .map((chapter) => ({ ...chapter, end: Math.min(chapter.end, measuredDurationMs) }));
};
