import { z } from "zod";
import { MediaInfo } from "../media-info/media-info.js";
import { TaskInfo } from "./task-info.js";
import { TaskPipelineDetails, TaskPipelineInfo } from "./task-pipeline-info.js";

export const TasksResponse = z.object({
  taskPipelines: TaskPipelineInfo.array(),
  tasks: TaskInfo.array(),
});
export type TasksResponse = z.infer<typeof TasksResponse>;

export const AddTaskRequest = z.object({
  name: z.string(),
  mediaFormat: z.string().optional(),
});
export type AddTaskRequest = z.infer<typeof AddTaskRequest>;

export const DownloadContentResponse = z.object({
  name: z.string(),
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

export const ControlRequest = z.union([ControlPipelineRequest, ControlTaskRequest]);
export type ControlRequest = z.infer<typeof ControlRequest>;

export const isControlPipelineRequest = (controlRequest: ControlRequest): controlRequest is ControlPipelineRequest => {
  return "pipelineExecutionId" in controlRequest;
};

export const isControlTaskRequest = (controlRequest: ControlRequest): controlRequest is ControlTaskRequest => {
  return "taskId" in controlRequest;
};