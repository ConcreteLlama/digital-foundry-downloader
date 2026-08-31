import { z } from "zod";
import { CLEAR_MISSING_FILES_TASK_TYPE } from "./clear-missing-files-task.js";
import { SCAN_FOR_EXISTING_CONTENT_TASK_TYPE } from "./scan-for-existing-files-task.js";

export const TaskState = z.enum([
  "idle",
  "awaiting_retry",
  "running",
  "pausing",
  "paused",
  "success",
  "failed",
  "cancelling",
  "cancelled",
]);
export type TaskState = z.infer<typeof TaskState>;
export const TaskCapabilities = z.enum(["pause", "cancel"]);
export type TaskCapabilities = z.infer<typeof TaskCapabilities>;
/**
 * Generic progress for any task that can report it.
 *
 * Downloads have always had their own richer progress (bytes, speed, ETA -
 * see DownloadProgressInfo); this is the lowest common denominator so that
 * anything else able to say how far along it is can, without inventing a
 * per-task-type shape. Tasks opt in by returning `{ progress }` from their
 * getStatus(); tasks that can't report progress simply omit it and the UI
 * falls back to a status message as before.
 */
export const TaskProgress = z.object({
  /** 0-100. */
  percent: z.number(),
  /** Optional human-readable detail, e.g. "3:12 / 11:00". */
  detail: z.string().optional(),
});
export type TaskProgress = z.infer<typeof TaskProgress>;

/**
 * Below this, an estimate is not worth showing.
 *
 * At 1%, a couple of seconds of noise moves the projection by minutes, and a
 * confidently wrong number is worse than no number.
 */
const MIN_PERCENT_FOR_ESTIMATE = 3;

/**
 * Roughly how long a step reporting a percentage has left, extrapolated from
 * how long it took to get this far.
 *
 * This assumes the rest of the work costs about what the work so far did,
 * which holds well enough for the steps that report this way - transcribing
 * and remuxing both grind through a file at a fairly even rate. Downloads do
 * not use this: they know their byte rate, so they can do better (see
 * calculateTimeRemainingSeconds).
 *
 * Returns undefined rather than a guess when there isn't enough to go on,
 * so callers render nothing at all in that case.
 */
export const estimateProgressTimeRemainingMs = (
  startTime: Date | string | undefined,
  progress: TaskProgress | undefined
): number | undefined => {
  if (!startTime || !progress) {
    return undefined;
  }
  const { percent } = progress;
  if (percent < MIN_PERCENT_FOR_ESTIMATE || percent >= 100) {
    return undefined;
  }
  const elapsed = Date.now() - new Date(startTime).getTime();
  if (elapsed <= 0) {
    return undefined;
  }
  return (elapsed / percent) * (100 - percent);
};

export const TaskStatus = z.object({
  state: TaskState,
  pauseTrigger: z.union([z.literal("manual"), z.literal("auto")]).optional(),
  forceStarted: z.boolean().optional(),
  message: z.string().optional(),
  attempt: z.number().default(1),
  error: z.any().optional(),
  isComplete: z.boolean(),
  /** See TaskProgress - present only for tasks that can report progress. */
  progress: TaskProgress.optional(),
  /**
   * Working time, as a two-scalar stopwatch rather than a history of intervals.
   *
   *   pause:  accumulatedActiveMs += now - lastResumedAt; lastResumedAt = null
   *   resume: lastResumedAt = now
   *   read:   accumulatedActiveMs + (lastResumedAt ? now - lastResumedAt : 0)
   *
   * Distinct from wall-clock elapsed (endTime/startTime), which keeps running
   * while a task is paused and SHOULD - "queued at 14:02, still not done" is a
   * real thing to know. This is the other number: what throughput should divide
   * by, and what stops ticking the moment you pause. On a paused row,
   * "Elapsed 6m 29s - Active 2m 14s" says more than either alone.
   *
   * Both optional and additive, so persisted records written before they
   * existed parse unchanged.
   */
  accumulatedActiveMs: z.number().optional(),
  /** Null or absent while not running - see accumulatedActiveMs. */
  lastResumedAt: z.coerce.date().nullish(),
});

/**
 * Working time so far. The client may project forward from lastResumedAt ONLY
 * while the task is running - the general rule that keeps a paused row from
 * inventing numbers.
 */
export const activeMsSoFar = (status: TaskStatus | null | undefined): number | undefined => {
  if (!status) {
    return undefined;
  }
  const accumulated = status.accumulatedActiveMs ?? 0;
  if (status.state !== "running" || !status.lastResumedAt) {
    return status.accumulatedActiveMs === undefined && !status.lastResumedAt ? undefined : accumulated;
  }
  return accumulated + (Date.now() - new Date(status.lastResumedAt).getTime());
};
export type TaskStatus = z.infer<typeof TaskStatus>;

export const BasicTaskInfo = z.object({
  id: z.string(),
  /** When the task first started running - absent while it's still queued. */
  startTime: z.coerce.date().optional(),
  /** When it finished, however it finished - absent while still running. */
  endTime: z.coerce.date().optional(),
  /**
   * True for a step that completed in an *earlier* run and was carried
   * forward when the pipeline resumed, rather than running this time.
   *
   * Without this such a step is indistinguishable from one that never ran,
   * so a resumed download reads as "Download: skipped" - which is both alarming
   * and wrong. It didn't get skipped, it already happened.
   */
  carriedOver: z.boolean().optional(),
  type: z.literal("task"),
  taskType: z.string(),
  /**
   * The job this task was queued on behalf of, if any.
   *
   * A bulk run queues its items as ordinary tasks so they inherit the
   * queue everything else has - a position, shift up and down, cancel
   * before it ever starts. That is the whole point: a queued item you
   * cannot see or reach is the thing this exists to fix.
   *
   * It also stops them landing in Activity as N unrelated top-level rows.
   * The client groups children under their job, so a five hundred item
   * run stays one row until you open it.
   */
  parentTaskId: z.string().optional(),
  capabilities: TaskCapabilities.array(),
  status: TaskStatus.nullable(),
  priority: z.number(),
  position: z.number(),
  priorityPosition: z.number(),
});

export type BasicTaskInfo = z.infer<typeof BasicTaskInfo>;