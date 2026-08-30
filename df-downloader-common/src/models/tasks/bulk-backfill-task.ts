import { z } from "zod";
import { BasicTaskInfo, TaskStatus } from "./base-task-info.js";

export const BULK_BACKFILL_TASK_TYPE = "bulk_backfill";

/**
 * What happened to one item in a run.
 *
 * "skipped" and "not_applicable" are deliberately separate: the first is an
 * item that already had the thing, the second one that could never take it
 * (no video to transcribe, no YouTube id to match an article against). They
 * look identical in a total and mean quite different things when you are
 * working out why a run of 300 produced 4 results.
 */
export const BulkBackfillOutcome = z.enum(["done", "skipped", "not_applicable", "failed"]);
export type BulkBackfillOutcome = z.infer<typeof BulkBackfillOutcome>;

export const BulkBackfillFailure = z.object({
  contentKey: z.string(),
  error: z.string(),
});
export type BulkBackfillFailure = z.infer<typeof BulkBackfillFailure>;

/**
 * The tally for a run, and the failures behind it.
 *
 * Counts rather than a row per item, and the failure list is capped: the
 * task snapshot is pushed in full to every connected browser on every
 * change, so a three-thousand-item run would otherwise send three thousand
 * rows several times a second. The counts are what answer "what happened",
 * and the failures are the only part anyone needs to read individually.
 */
export const BulkBackfillSummary = z.object({
  total: z.number(),
  done: z.number(),
  skipped: z.number(),
  notApplicable: z.number(),
  failed: z.number(),
  /** Neither finished nor failed yet - the rest of the run. */
  pending: z.number(),
  failures: z.array(BulkBackfillFailure),
  /** True when `failures` was cut short, so the UI can say so. */
  failuresTruncated: z.boolean().optional(),
});
export type BulkBackfillSummary = z.infer<typeof BulkBackfillSummary>;

export const BulkBackfillTaskStatus = TaskStatus.extend({
  backfill: BulkBackfillSummary.optional(),
});
export type BulkBackfillTaskStatus = z.infer<typeof BulkBackfillTaskStatus>;

export const BulkBackfillTaskInfo = BasicTaskInfo.extend({
  taskType: z.literal(BULK_BACKFILL_TASK_TYPE),
  status: BulkBackfillTaskStatus.nullable(),
});
export type BulkBackfillTaskInfo = z.infer<typeof BulkBackfillTaskInfo>;

export const isBulkBackfillTaskInfo = (task?: any | null): task is BulkBackfillTaskInfo =>
  task?.taskType === BULK_BACKFILL_TASK_TYPE;
