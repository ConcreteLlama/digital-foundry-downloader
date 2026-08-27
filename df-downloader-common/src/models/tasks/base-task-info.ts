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
});
export type TaskStatus = z.infer<typeof TaskStatus>;

export const BasicTaskInfo = z.object({
  id: z.string(),
  type: z.literal("task"),
  taskType: z.string(),
  capabilities: TaskCapabilities.array(),
  status: TaskStatus.nullable(),
  priority: z.number(),
  position: z.number(),
  priorityPosition: z.number(),
});

export type BasicTaskInfo = z.infer<typeof BasicTaskInfo>;