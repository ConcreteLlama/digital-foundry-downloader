import { z } from "zod";
import { BasicTaskInfo, TaskStatus } from "./base-task-info.js";

const MoveFilesTaskBaseResults = z.object({
    moved: z.number(),
    recordRemoved: z.number(),
    failed: z.number(),
    total: z.number(),
});

export const MoveFilesTaskProgressInfo = MoveFilesTaskBaseResults.extend({
    moving: z.number(),
    complete: z.number(),
    remaining: z.number(),
});
export type MoveFilesTaskProgressInfo = z.infer<typeof MoveFilesTaskProgressInfo>;

export const MoveFilesTaskStatus = TaskStatus.extend({
    currentProgress: MoveFilesTaskProgressInfo,
});
export type MoveFilesTaskStatus = z.infer<typeof MoveFilesTaskStatus>;

export const MoveFilesTaskResult = MoveFilesTaskBaseResults.extend({
    errors: z.string().array(),
});
export type MoveFilesTaskResult = z.infer<typeof MoveFilesTaskResult>;

export const BATCH_MOVE_FILES_TASK_TYPE = "batch_move_files";
export const MoveFilesTaskInfo = BasicTaskInfo.extend({
    taskType: z.literal(BATCH_MOVE_FILES_TASK_TYPE),
    status: MoveFilesTaskStatus.nullable(),
    result: MoveFilesTaskResult.nullable(),
});
export type MoveFilesTaskInfo = z.infer<typeof MoveFilesTaskInfo>;
export const isMoveFilesTaskInfo = (task?: any | null): task is MoveFilesTaskInfo => {
    return task?.taskType === BATCH_MOVE_FILES_TASK_TYPE;
};
