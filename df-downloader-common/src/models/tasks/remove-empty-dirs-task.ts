import { z } from "zod";
import { BasicTaskInfo } from "./base-task-info.js";

export const RemoveEmptyDirsResult = z.object({
    removedDirs: z.string().array(),
});
export type RemoveEmptyDirsResult = z.infer<typeof RemoveEmptyDirsResult>;

export const REMOVE_EMPTY_DIRS_TASK_TYPE = "remove_empty_dirs";
export const RemoveEmptyDirsTaskInfo = BasicTaskInfo.extend({
    taskType: z.literal(REMOVE_EMPTY_DIRS_TASK_TYPE),
    result: RemoveEmptyDirsResult.nullable(),
});
export type RemoveEmptyDirsTaskInfo = z.infer<typeof RemoveEmptyDirsTaskInfo>;
export const isRemoveEmptyDirsTaskInfo = (task?: any | null): task is RemoveEmptyDirsTaskInfo => {
    return task?.taskType === REMOVE_EMPTY_DIRS_TASK_TYPE;
};
