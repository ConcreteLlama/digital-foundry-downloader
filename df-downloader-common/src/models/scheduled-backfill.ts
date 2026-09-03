import { z } from "zod";
import { AiProviderId, ScheduledBackfillConfig } from "../config/ai-analysis-config.js";

/**
 * Why a window stopped feeding.
 *
 * Recorded rather than inferred, because the difference is the whole point of
 * the history view: "stopped at close with 29 remaining" and "stopped early,
 * nothing left eligible" are the same row shape and mean opposite things about
 * whether the window is long enough.
 */
export const ScheduledBackfillEndReason = z.enum([
  /** The window closed with work still to do. */
  "closed",
  /** Nothing was left eligible. */
  "ran_dry",
  /** maxPerWindow was reached. */
  "cap_reached",
  /** The service stopped, or the schedule was turned off, mid-window. */
  "interrupted",
]);
export type ScheduledBackfillEndReason = z.infer<typeof ScheduledBackfillEndReason>;

/**
 * One window, and what it managed to do.
 *
 * `items` carries each title as well as its key, so a row stays readable even
 * after the content is gone from the library. That is the same concern the
 * mock-ups raise about linking to tasks - completed tasks get cleared, so
 * anything built on them empties itself out within a day or two - taken one
 * step further: the history holds its own copy rather than depending on
 * anything else still existing.
 */
export const ScheduledBackfillWindowRecord = z.object({
  id: z.string(),
  openedAt: z.coerce.date(),
  /** Absent while the window is still open. */
  endedAt: z.coerce.date().optional(),
  /** What the window was scheduled to close at, which is not when it ended if the service stopped first. */
  scheduledCloseAt: z.coerce.date(),
  provider: AiProviderId.optional(),
  analysed: z.number().int().default(0),
  failed: z.number().int().default(0),
  /** How many were still eligible when it ended. */
  remaining: z.number().int().optional(),
  endReason: ScheduledBackfillEndReason.optional(),
  items: z.object({ key: z.string(), title: z.string() }).array().default([]),
});
export type ScheduledBackfillWindowRecord = z.infer<typeof ScheduledBackfillWindowRecord>;

/**
 * Everything the settings panel needs to say what will happen and what did.
 *
 * Computed against a *draft* config rather than the saved one (see
 * ScheduledBackfillPreviewRequest), because the eligibility toggles change the
 * eligible count and a preview that only updates on save is a preview of the
 * wrong thing.
 */
export const ScheduledBackfillStatus = z.object({
  /**
   * Whether any engine can answer at all - the blocked state in mock-up
   * section 1. This is checked before anything else because a schedule with no
   * engine behind it does nothing, silently, forever, and silently doing
   * nothing is what a working scheduled feature looks like.
   */
  engineConfigured: z.boolean(),
  /** What is missing, when nothing is configured. From providerUnusableReason(). */
  engineBlockedReason: z.string().optional(),
  /** Engines the panel may offer. Only these; an unusable one is not a choice. */
  usableProviders: AiProviderId.array(),
  /** The engine fed runs would actually use. */
  provider: AiProviderId.optional(),
  /** True when the configured engine is unavailable and another one is standing in. */
  providerFellBack: z.boolean().default(false),
  /** Why the schedule cannot be read, if it cannot. A typo must not silently mean "never". */
  scheduleError: z.string().optional(),
  windowOpen: z.boolean(),
  /** When the window next opens - or when the current one opened, while it is open. */
  opensAt: z.coerce.date().optional(),
  /** When it stops *starting* new analyses. Work already begun runs past this. */
  closesAt: z.coerce.date().optional(),
  /**
   * The server's own clock and zone.
   *
   * Surfaced rather than assumed: cron runs in the container's zone, and a
   * server in another zone is the thing that surprises people.
   */
  serverTime: z.coerce.date(),
  timeZone: z.string(),
  eligibleCount: z.number().int(),
  /**
   * Why nothing is eligible, when nothing is. "Nothing eligible" on its own
   * reads like a fault rather than a finished job.
   */
  emptyReason: z.string().optional(),
  /** Progress within the window that is open now. */
  analysedThisWindow: z.number().int().default(0),
  failedThisWindow: z.number().int().default(0),
  /** Fed runs queued or running right now. Never more than one, by design. */
  inFlight: z.number().int().default(0),
  /** Hosted engines only - meaningless for a local run, so absent for one. */
  estimatedCostUsd: z.number().optional(),
  history: ScheduledBackfillWindowRecord.array().default([]),
});
export type ScheduledBackfillStatus = z.infer<typeof ScheduledBackfillStatus>;

/**
 * Previews a schedule that has not been saved.
 *
 * Follows TestAiProviderRequest: the question is always about what is on
 * screen, not about what was last committed. Omit `draft` to preview the saved
 * configuration, which is what the AI Analysis page's summary link asks for.
 */
export const ScheduledBackfillPreviewRequest = z.object({
  draft: ScheduledBackfillConfig.optional(),
});
export type ScheduledBackfillPreviewRequest = z.infer<typeof ScheduledBackfillPreviewRequest>;
