import { z } from "zod";
import { DfContentInfo } from "../df-content-info.js";
import { MediaType } from "../../config/df-config.js";
import { TaskInfo } from "./task-info.js";
import { mapFilterEmpty } from "../../utils/general.js";
import { isDownloadTaskInfo } from "./download-task.js";

export const PipelineResultStatus = z.enum(["success", "failed", "cancelled"]);
export type PipelineResultStatus = z.infer<typeof PipelineResultStatus>;

export const DfStepName = z.enum(["Download", "Fetch Subtitles", "Inject Metadata", "Move File"]);
export type DfStepName = z.infer<typeof DfStepName>;

export const DfPipelineType = z.enum(["download", "subtitles"]);
export type DfPipelineType = z.infer<typeof DfPipelineType>;

const StepDetails = z.object({
    name: z.union([DfStepName, z.string()]),
    id: z.string(),
});
export type StepDetails = z.infer<typeof StepDetails>;

export const TaskPipelineDetails = z.object({
    type: DfPipelineType,
    id: z.string(),
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
    id: z.string(),
    type: z.literal("pipeline"),
    pipelineType: DfPipelineType,
    pipelineDetails: TaskPipelineDetails,
    pipelineStatus: TaskPipelineStatus,
    stepTasks: z.record(TaskInfo),
});
export type TaskPipelineInfo = z.infer<typeof TaskPipelineInfo>;
export const isTaskPipelineInfo = (task: TaskPipelineInfo | TaskInfo): task is TaskPipelineInfo => {
    return "pipelineDetails" in task;
}

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