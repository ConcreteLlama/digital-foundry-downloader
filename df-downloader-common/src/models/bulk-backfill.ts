import { z } from "zod";

/**
 * Bulk backfill: applying subtitle generation, AI analysis or Digital
 * Foundry article matching across many library items at once.
 *
 * All three are per-item batch actions over a selected set, which is why
 * they share one page and one request shape rather than getting three
 * near-identical UIs.
 *
 * Article matching was originally scoped as a different shape - a
 * whole-library "sweep" rather than a per-item action - because a
 * per-item lookup was assumed to mean one site fetch per item. That is no
 * longer true: the matcher fetches Digital Foundry's year-partitioned
 * sitemaps once and caches them for hours, so looping per item reuses one
 * fetch across everything published that year. The per-item shape is now
 * both simpler and no less efficient, and it gains a selection UI the
 * sweep could not have had.
 */
export const BulkBackfillTarget = z.enum(["subtitles", "ai_analysis", "df_article"]);
export type BulkBackfillTarget = z.infer<typeof BulkBackfillTarget>;

export const BulkBackfillTargetLabels: Record<BulkBackfillTarget, string> = {
  subtitles: "Subtitles",
  ai_analysis: "AI analysis",
  df_article: "Digital Foundry articles",
};

/**
 * One library item and what it already has.
 *
 * Sent as plain state rather than a per-target "applicable" boolean so the
 * client can recompute applicability when the re-run toggle changes,
 * without another round trip. The server re-checks the same state when the
 * job actually runs - see the note on BulkBackfillRequest.
 */
export const BulkBackfillCandidate = z.object({
  contentKey: z.string(),
  title: z.string(),
  publishedDate: z.coerce.date(),
  /** Whether anything has been downloaded - subtitles and analysis both need a file. */
  hasDownload: z.boolean().default(false),
  /** Subtitles recorded against at least one download, in the requested language. */
  hasSubtitles: z.boolean().default(false),
  hasAnalysis: z.boolean().default(false),
  /** A confirmed article match is stored for this item. */
  hasArticle: z.boolean().default(false),
  /**
   * Whether an article lookup is due.
   *
   * False while a previous miss is still inside its backoff window. A miss
   * is never final - Digital Foundry frequently publish their written
   * piece well after the video - so this goes true again on its own rather
   * than the item being permanently excluded.
   */
  articleLookupDue: z.boolean().default(true),
});
export type BulkBackfillCandidate = z.infer<typeof BulkBackfillCandidate>;

export const BulkBackfillCandidatesResponse = z.object({
  candidates: z.array(BulkBackfillCandidate).default([]),
  /** Total library size, so the page can say what it is not showing. */
  libraryCount: z.number().default(0),
});
export type BulkBackfillCandidatesResponse = z.infer<typeof BulkBackfillCandidatesResponse>;

export const BulkBackfillRequest = z.object({
  target: BulkBackfillTarget,
  contentKeys: z.array(z.string()).min(1),
  /**
   * Redo work that has already been done - re-transcribe, re-analyse, or
   * re-search for an article that was already matched.
   *
   * Off by default everywhere. Without it the job skips items that already
   * have the thing, **re-checked against live state as each item comes up**
   * rather than against the client's snapshot from when the job was
   * queued. A job over a few hundred items runs for a long time, and an
   * item can gain subtitles from an unrelated action while it waits its
   * turn; regenerating them because a minutes-old list said it had none
   * would be both wasteful and surprising.
   */
  force: z.boolean().default(false),
});
export type BulkBackfillRequest = z.infer<typeof BulkBackfillRequest>;

export const BulkBackfillStartedResponse = z.object({
  message: z.string(),
  taskId: z.string(),
  /** How many items the job was actually queued with, after server-side filtering. */
  queued: z.number().default(0),
  /** Items dropped because they already had the thing and force was off. */
  skipped: z.number().default(0),
});
export type BulkBackfillStartedResponse = z.infer<typeof BulkBackfillStartedResponse>;

export const BulkBackfillEstimateRequest = z.object({
  target: BulkBackfillTarget,
  contentKeys: z.array(z.string()).default([]),
  force: z.boolean().default(false),
});
export type BulkBackfillEstimateRequest = z.infer<typeof BulkBackfillEstimateRequest>;

/**
 * What a bulk run will cost, before committing to it.
 *
 * Only AI analysis costs money, and it is the one target where a careless
 * click can spend real amounts across hundreds of items, so the estimate
 * is shown on the confirmation step rather than tucked behind a
 * disclosure. That differs deliberately from the single-item panel, where
 * cost is a detail about a run that has already happened; here it is the
 * decision being made.
 *
 * Sampled rather than measured per item: pricing a thousand items exactly
 * would mean a thousand token-counting calls, which is itself slow enough
 * to be its own problem. A handful are priced properly and scaled, which
 * is accurate enough to decide on and is labelled as an estimate.
 */
export const BulkBackfillEstimate = z.object({
  target: BulkBackfillTarget,
  itemCount: z.number().default(0),
  /** Absent for targets that cost nothing but time. */
  estimatedCostUsd: z.number().optional(),
  /** How many items were actually priced to produce the figure. */
  sampledCount: z.number().default(0),
  /**
   * Requests this run will make to digitalfoundry.net, where relevant.
   *
   * Surfaced because those are rate-limited by a deliberately conservative
   * queue, so the count is really a statement about how long the job runs
   * and how much load it puts on a small team's site.
   */
  estimatedDfRequests: z.number().optional(),
  note: z.string().optional(),
});
export type BulkBackfillEstimate = z.infer<typeof BulkBackfillEstimate>;

/**
 * Stop the work a run left in the queue.
 *
 * By run id rather than "stop everything": a run finishes dispatching almost
 * immediately, so several can have work in flight at once, and stopping one
 * must not take the others - or anything queued by hand - with it.
 */
export const BulkBackfillStopRequest = z.object({
  backfillJobIds: z.array(z.string()).min(1),
});
export type BulkBackfillStopRequest = z.infer<typeof BulkBackfillStopRequest>;

export const BulkBackfillStopResponse = z.object({
  /** Queued items taken out of the queue - these are definitely stopped. */
  cancelled: z.number().default(0),
  /**
   * Items already running when the stop arrived.
   *
   * Asked to stop, but not all work can: transcription in particular declines
   * and runs to the end. Counted separately rather than reported as cancelled,
   * which would be a claim this cannot make.
   */
  stillRunning: z.number().default(0),
});
export type BulkBackfillStopResponse = z.infer<typeof BulkBackfillStopResponse>;
