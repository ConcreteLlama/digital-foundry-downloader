import { z } from "zod";
import { MediaInfo } from "../media-info/media-info.js";
import { TaskInfo } from "./task-info.js";
import { TaskPipelineDetails, TaskPipelineInfo } from "./task-pipeline-info.js";

/**
 * A piece of content queued for a delayed auto-download, still waiting out its
 * jittered downloadDelayMinMs/downloadDelayMaxMs window - not a task/pipeline
 * yet (those only get created once the delay elapses and the download
 * actually starts), so this is the only place this state is visible.
 */
export const ScheduledDownloadInfo = z.object({
  contentKey: z.string(),
  title: z.string(),
  scheduledFor: z.coerce.date(),
});
export type ScheduledDownloadInfo = z.infer<typeof ScheduledDownloadInfo>;

export const TasksResponse = z.object({
  taskPipelines: TaskPipelineInfo.array(),
  tasks: TaskInfo.array(),
  scheduledDownloads: ScheduledDownloadInfo.array(),
});
export type TasksResponse = z.infer<typeof TasksResponse>;

export const AddTaskRequest = z.object({
  key: z.string(),
  mediaFormat: z.string().optional(),
});
export type AddTaskRequest = z.infer<typeof AddTaskRequest>;

export const ManualDownloadRequest = z.object({
  url: z.string(),
  title: z.string(),
  description: z.string().optional(),
  publishedDate: z.string().optional(),
  tags: z.array(z.string()).optional(),
  mediaFormat: z.string().optional(),
  youtubeUrl: z.string().optional(),
});
export type ManualDownloadRequest = z.infer<typeof ManualDownloadRequest>;

export const DownloadContentResponse = z.object({
  key: z.string(),
  mediaInfo: MediaInfo,
  pipelineInfo: TaskPipelineDetails,
});
export type DownloadContentResponse = z.infer<typeof DownloadContentResponse>;

const ChangePriorityAction = z.object({
  action: z.literal("change_priority"),
  priority: z.number(),
});
export type ChangePriorityAction = z.infer<typeof ChangePriorityAction>;
export const isChangePriorityAction = (action: TaskAction): action is ChangePriorityAction => {
  return typeof action === "object" && action.action === "change_priority";
};

const ChangePositionAction = z.object({
  action: z.literal("change_position"),
  position: z.number(),
});
export type ChangePositionAction = z.infer<typeof ChangePositionAction>;
export const isChangePositionAction = (action: TaskAction): action is ChangePositionAction => {
  return typeof action === "object" && action.action === "change_position";
};

const ShiftAction = z.object({
  action: z.literal("shift"),
  direction: z.union([z.literal("up"), z.literal("down")]),
  allowPriorityChange: z.boolean().default(false),
});
export type ShiftAction = z.infer<typeof ShiftAction>;
export const isShiftAction = (action: TaskAction): action is ShiftAction => {
  return typeof action === "object" && action.action === "shift";
};

const BasicTaskAction = z.union([z.literal("pause"), z.literal("resume"), z.literal("cancel"), z.literal("force_start"), z.literal("clear")]);
export type BasicTaskAction = z.infer<typeof BasicTaskAction>;

const TaskAction = z.union([
  BasicTaskAction,
  ShiftAction,
  ChangePriorityAction,
  ChangePositionAction,
]);
export type TaskAction = z.infer<typeof TaskAction>;

export const ControlPipelineRequest = z.object({
  pipelineExecutionId: z.string(),
  stepId: z.string().optional(),
  action: TaskAction,
});
export type ControlPipelineRequest = z.infer<typeof ControlPipelineRequest>;

export const ControlTaskRequest = z.object({
  taskId: z.string(),
  action: TaskAction,
});
export type ControlTaskRequest = z.infer<typeof ControlTaskRequest>;

/**
 * Pause or resume everything at once.
 *
 * Only these two: cancelling everything is not a thing anyone wants a single
 * button for, and reordering has no meaning applied to the whole queue.
 */
export const ControlAllRequest = z.object({
  /**
   * "stop" cancels everything in flight rather than holding it, so unlike the
   * other two it throws work away. Reordering has no meaning applied to a
   * whole queue, which is why it is not here.
   */
  action: z.enum(["pause", "resume", "stop"]),
});
export type ControlAllRequest = z.infer<typeof ControlAllRequest>;

/** What a bulk pause or resume actually managed to do. */
export const ControlAllResponse = z.object({
  /** Running tasks that took the instruction. */
  affected: z.number().default(0),
  /** Running work that would not take it - see controlAll. */
  skipped: z.number().default(0),
  /**
   * Whether the queues are now held.
   *
   * The part that always works, and usually the part that matters: nothing
   * new starts while it is true, however little of the running work could be
   * stopped where it stood.
   */
  queueHeld: z.boolean().default(false),
});
export type ControlAllResponse = z.infer<typeof ControlAllResponse>;

export const ControlRequest = z.union([ControlPipelineRequest, ControlTaskRequest]);
export type ControlRequest = z.infer<typeof ControlRequest>;

export const isControlPipelineRequest = (controlRequest: ControlRequest): controlRequest is ControlPipelineRequest => {
  return "pipelineExecutionId" in controlRequest;
};

export const isControlTaskRequest = (controlRequest: ControlRequest): controlRequest is ControlTaskRequest => {
  return "taskId" in controlRequest;
};