import { z } from "zod";
import { AiEvidenceSource } from "./ai-analysis.js";

/**
 * What a content row can show a badge for, beyond what the entry itself holds.
 *
 * Sent alongside the entries rather than folded into them: whether something
 * has been analysed is not a fact about the content, it is a fact about what
 * this installation has done to it, and DfContentEntry is the domain model.
 *
 * Cheap to produce - both are read from indexes already held in memory for
 * exactly this purpose, so a list view never opens a result file to render a
 * badge.
 */
export const DfContentBadgeState = z.object({
  analysed: z.boolean().default(false),
  /**
   * What the analysis actually read.
   *
   * Carried because "analysed" alone overstates it: an analysis from a title
   * and description is a much weaker thing than one from a transcript, and
   * this is what lets a row say which it has.
   */
  analysisEvidence: z.array(AiEvidenceSource).default([]),
  hasArticle: z.boolean().default(false),
  /** Whether you have seen it, from this app's own watch state. */
  watched: z.boolean().default(false),
  /**
   * How far through, 0-1, when a position and a duration are both known.
   *
   * Carried separately from `watched` because "started" and "finished" are
   * different things to draw: a part-watched row wants a progress hint, a
   * finished one wants a tick. Absent when nothing has been played, or when
   * whatever reported the position never said how long the file was.
   */
  watchedFraction: z.number().min(0).max(1).optional(),
});
export type DfContentBadgeState = z.infer<typeof DfContentBadgeState>;

/** Keyed by content key, for the entries on one page only. */
export const DfContentBadgeMap = z.record(z.string(), DfContentBadgeState).default({});
export type DfContentBadgeMap = z.infer<typeof DfContentBadgeMap>;

/**
 * Badges for a named set of content keys.
 *
 * Its own endpoint rather than a field bolted onto the single-entry fetch,
 * because a badge is not part of the entry - and because the thing that makes
 * a badge go stale (an analysis finishing) does not change the entry at all,
 * so re-fetching the entry to learn about it would be the wrong request.
 */
export const DfContentBadgesResponse = z.object({
  badges: DfContentBadgeMap,
});
export type DfContentBadgesResponse = z.infer<typeof DfContentBadgesResponse>;
