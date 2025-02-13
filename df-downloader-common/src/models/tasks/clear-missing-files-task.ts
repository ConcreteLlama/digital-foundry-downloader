import { z } from "zod";
import { BasicTaskInfo, TaskStatus } from "./base-task-info.js";

export const ClearMissingFilesResult = z.object({
    removedFileReferences: z.string().array(),
});
export type ClearMissingFilesResult = z.infer<typeof ClearMissingFilesResult>;
export const ClearMissingFilesTaskStatus = TaskStatus.extend({
    removedFileReferenceCount: z.number(),
    totalToScan: z.number(),
    totalScanned: z.number(),
});
export type ClearMissingFilesTaskStatus = z.infer<typeof ClearMissingFilesTaskStatus>;

export const CLEAR_MISSING_FILES_TASK_TYPE = "clear_missing_files";
export const ClearMissingFilesTaskInfo = BasicTaskInfo.extend({
    taskType: z.literal(CLEAR_MISSING_FILES_TASK_TYPE),
    result: ClearMissingFilesResult.nullable(),
    status: ClearMissingFilesTaskStatus.nullable(),
});
export type ClearMissingFilesTaskInfo = z.infer<typeof ClearMissingFilesTaskInfo>;
export const isClearMissingFilesTaskInfo = (task?: any | null): task is ClearMissingFilesTaskInfo => {
    return task?.taskType === CLEAR_MISSING_FILES_TASK_TYPE;
};
