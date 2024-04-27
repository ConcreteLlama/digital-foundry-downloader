import { z } from "zod";
import { MediaType } from "../config/df-config.js";
import { mapFilterEmpty } from "../utils/general.js";
import { DfContentInfo } from "./df-content-info.js";
import { DownloadProgressInfo } from "./download-progress-info.js";

export const PipelineResultStatus = z.enum(["success", "failed", "cancelled"]);
export type PipelineResultStatus = z.infer<typeof PipelineResultStatus>;

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

export const DfTaskType = z.enum(["download", "subtitles", "inject_metadata", "move_file"]);
export type DfTaskType = z.infer<typeof DfTaskType>;

export const DfStepName = z.enum(["Download", "Fetch Subtitles", "Inject Metadata", "Move File"]);
export type DfStepName = z.infer<typeof DfStepName>;

export const DfPipelineType = z.enum(["download", "subtitles"]);
export type DfPipelineType = z.infer<typeof DfPipelineType>;

export const TaskCapabilities = z.enum(["pause", "cancel"]);
export type TaskCapabilities = z.infer<typeof TaskCapabilities>;
export const TaskStatus = z.object({
  state: TaskState,
  pauseTrigger: z.union([z.literal("manual"), z.literal("auto")]).optional(),
  forceStarted: z.boolean().optional(),
  id: z.string(),
  message: z.string().optional(),
  attempt: z.number().default(1),
  error: z.any().optional(),
});
export type TaskStatus = z.infer<typeof TaskStatus>;
export const DownloadTaskStatus = TaskStatus.extend({
  currentProgress: DownloadProgressInfo.optional(),
});
export type DownloadTaskStatus = z.infer<typeof DownloadTaskStatus>;

export const BasicTaskInfo = z.object({
  taskType: z.string(),
  capabilities: TaskCapabilities.array(),
  status: TaskStatus.nullable(),
  priority: z.number(),
  position: z.number(),
  priorityPosition: z.number(),
});

export type BasicTaskInfo = z.infer<typeof BasicTaskInfo>;

export const DownloadTaskInfo = BasicTaskInfo.extend({
  taskType: z.literal("download"),
  status: DownloadTaskStatus.nullable(),
});
export type DownloadTaskInfo = z.infer<typeof DownloadTaskInfo>;
export const isDownloadTaskInfo = (task?: TaskInfo | null): task is DownloadTaskInfo => {
  return task?.taskType === "download";
};

const TaskInfo = z.any().transform((data) => {
  if (data.taskType === "download") {
    return DownloadTaskInfo.parse(data);
  } else {
    return BasicTaskInfo.parse(data);
  }
});
export type TaskInfo = z.infer<typeof TaskInfo>;

const StepDetails = z.object({
  name: z.union([DfStepName, z.string()]),
  id: z.string(),
});
export type StepDetails = z.infer<typeof StepDetails>;

export const TaskPipelineDetails = z.object({
  id: z.string(),
  type: DfPipelineType,
  queuedTime: z.coerce.date().optional(),
  dfContent: DfContentInfo,
  mediaType: MediaType,
  destinationPath: z.string().optional(),
  stepOrder: z.string().array(),
  steps: z.record(StepDetails),
});
export type TaskPipelineDetails = z.infer<typeof TaskPipelineDetails>;

export const TaskPipelineStatus = z.object({
  currentStep: z.string().optional(),
  statusMessage: z.string(),
  isComplete: z.boolean(),
  pipelineResult: PipelineResultStatus.optional(),
});
export type TaskPipelineStatus = z.infer<typeof TaskPipelineStatus>;

export const TaskPipelineInfo = z.object({
  pipelineDetails: TaskPipelineDetails,
  pipelineStatus: TaskPipelineStatus,
  stepTasks: z.record(TaskInfo),
});
export type TaskPipelineInfo = z.infer<typeof TaskPipelineInfo>;

export const TaskResponse = z.object({
  taskPipelines: TaskPipelineInfo.array(),
});
export type TaskResponse = z.infer<typeof TaskResponse>;

export const TaskPipelineUtils = {
  getCurrentStep: ({ pipelineDetails, pipelineStatus }: TaskPipelineInfo) => {
    if (!pipelineStatus.currentStep) {
      return null;
    }
    return pipelineDetails.steps[pipelineStatus.currentStep];
  },
  getCurrentTask: ({ pipelineStatus, stepTasks }: TaskPipelineInfo) => {
    const currentStep = pipelineStatus.currentStep;
    if (!currentStep) {
      return null;
    }
    return stepTasks[currentStep];
  },
  getStepList: ({ pipelineDetails }: TaskPipelineInfo) => {
    return pipelineDetails.stepOrder.map((stepId) => pipelineDetails.steps[stepId]);
  },
  getDownloadTasks: (pipelines: TaskPipelineInfo[]) => {
    return mapFilterEmpty(pipelines, ({ pipelineStatus, stepTasks }) => {
      if (!pipelineStatus.currentStep) {
        return null;
      }
      const currentTask = stepTasks[pipelineStatus.currentStep];
      return isDownloadTaskInfo(currentTask) ? currentTask : null;
    });
  },
  getCumulativeDownloadStats: (queuedContent: TaskPipelineInfo[]) => {
    const downloadTasks = TaskPipelineUtils.getDownloadTasks(queuedContent);
    return downloadTasks.reduce(
      (acc, downloadTask) => {
        const currentProgress = downloadTask.status?.currentProgress;
        if (currentProgress) {
          const { currentBytesPerSecond, totalBytes, totalBytesDownloaded } = currentProgress;
          acc.bytesPerSecond += currentBytesPerSecond;
          acc.totalBytes += totalBytes;
          acc.totalBytesDownloaded += totalBytesDownloaded;
        }
        return acc;
      },
      {
        bytesPerSecond: 0,
        totalBytes: 0,
        totalBytesDownloaded: 0,
      }
    );
  },
};

export const AddTaskRequest = z.object({
  name: z.string(),
  mediaType: z.string().optional(),
});
export type AddTaskRequest = z.infer<typeof AddTaskRequest>;

const ChangePriorityAction = z.object({
  action: z.literal("change_priority"),
  priority: z.number(),
});
export type ChangePriorityAction = z.infer<typeof ChangePriorityAction>;
export const isChangePriorityAction = (action: TaskPipelineAction): action is ChangePriorityAction => {
  return typeof action === "object" && action.action === "change_priority";
};

const ChangePositionAction = z.object({
  action: z.literal("change_position"),
  position: z.number(),
});
export type ChangePositionAction = z.infer<typeof ChangePositionAction>;
export const isChangePositionAction = (action: TaskPipelineAction): action is ChangePositionAction => {
  return typeof action === "object" && action.action === "change_position";
};

const ShiftAction = z.object({
  action: z.literal("shift"),
  direction: z.union([z.literal("up"), z.literal("down")]),
  allowPriorityChange: z.boolean().default(false),
});
export type ShiftAction = z.infer<typeof ShiftAction>;
export const isShiftAction = (action: TaskPipelineAction): action is ShiftAction => {
  return typeof action === "object" && action.action === "shift";
};

const TaskPipelineAction = z.union([
  z.literal("pause"),
  z.literal("resume"),
  z.literal("cancel"),
  z.literal("force_start"),
  z.literal("clear"),
  ShiftAction,
  ChangePriorityAction,
  ChangePositionAction,
]);
export type TaskPipelineAction = z.infer<typeof TaskPipelineAction>;

export const ControlPipelineRequest = z.object({
  pipelineExecutionId: z.string(),
  stepId: z.string().optional(),
  action: TaskPipelineAction,
});
export type ControlPipelineRequest = z.infer<typeof ControlPipelineRequest>;
