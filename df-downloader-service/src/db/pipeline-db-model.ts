import { DfPipelineType } from "df-downloader-common";
import { z } from "zod";

/**
 * How a pipeline's steps and results are recorded so a restart doesn't throw
 * away work that already completed.
 *
 * The motivating case: a download takes tens of minutes and several
 * gigabytes, then subtitle generation can take an hour on modest hardware.
 * Nothing durable records that the download happened until the *entire*
 * pipeline succeeds (see DigitalFoundryContentManager's contentDownloaded
 * call, which fires on the pipeline's "completed" event), so a restart
 * during transcription previously meant re-downloading everything.
 *
 * This deliberately does not attempt to resume a task mid-flight. A step
 * that was running when the process died restarts from the beginning of
 * that step; what's preserved is everything *before* it. Losing 50 minutes
 * of a 60-minute transcription is annoying; losing the download that
 * preceded it is much worse.
 */
export const PersistedStepResult = z.object({
  status: z.enum(["success", "failed", "cancelled"]),
  /**
   * The step's return value, when it has one worth keeping.
   *
   * Later steps consume earlier ones - Inject Metadata reads the subtitles
   * and chapters results - so resuming at a later step without these would
   * mean re-running the steps that produced them, which is the expense this
   * exists to avoid. Typed loosely because each step returns its own shape;
   * it's validated by the step that consumes it, as it already was.
   */
  result: z.any().optional(),
  error: z.string().optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
});
export type PersistedStepResult = z.infer<typeof PersistedStepResult>;

export const PersistedPipeline = z.object({
  id: z.string(),
  pipelineType: DfPipelineType,
  /** DfContentInfo.key - the pipeline is rebuilt from this rather than from a stored copy of the content info. */
  contentKey: z.string(),
  /** MediaInfo.formatString, so the right format is resumed rather than re-chosen. */
  mediaFormat: z.string().optional(),
  queuedTime: z.coerce.date(),
  /** Index into stepOrder that was in progress when this was last written. */
  currentStepIndex: z.number(),
  stepOrder: z.string().array(),
  /** Keyed by step id - see PersistedStepResult. */
  stepResults: z.record(z.string(), PersistedStepResult).default({}),
  /**
   * The parts of the pipeline context worth restoring.
   *
   * Deliberately excludes `headers` and `url`. Headers carry the Digital
   * Foundry autologin cookie and have no business being written to disk;
   * the download URL is a time-limited signed CDN link that would likely be
   * stale by the time it mattered. Both are re-derived on resume - and a
   * pipeline interrupted during the download itself is re-queued from the
   * start rather than resumed, so neither is needed to continue.
   */
  context: z.object({
    downloadLocation: z.string().optional(),
    finalLocation: z.string().optional(),
    fileAtFinalLocation: z.boolean().optional(),
  }),
  /**
   * How many times this pipeline has been resumed after a restart. Capped so
   * a pipeline that reliably kills the process can't turn into a restart
   * loop that never lets the app finish starting.
   */
  resumeAttempts: z.number().default(0),
});
export type PersistedPipeline = z.infer<typeof PersistedPipeline>;

export const CompletedPipeline = PersistedPipeline.extend({
  completedAt: z.coerce.date(),
  result: z.enum(["success", "failed", "cancelled"]),
});
export type CompletedPipeline = z.infer<typeof CompletedPipeline>;

export const ActivePipelineDbSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  pipelines: z.record(z.string(), PersistedPipeline).default({}),
});
export type ActivePipelineDbSchema = z.infer<typeof ActivePipelineDbSchema>;

export const CompletedPipelineDbSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  /** Newest first, trimmed to a retention limit - see CompletedPipelineDb. */
  pipelines: CompletedPipeline.array().default([]),
});
export type CompletedPipelineDbSchema = z.infer<typeof CompletedPipelineDbSchema>;
