import { z } from "zod";
import { BasicTaskInfo } from "./base-task-info.js";

export const ScanForExistingContentResult = z.object({
    foundFiles: z.string().array(),
});
export type ScanForExistingContentResult = z.infer<typeof ScanForExistingContentResult>;

export const SCAN_FOR_EXISTING_CONTENT_TASK_TYPE = "scan_for_existing_content";
export const ScanForExistingContentTaskInfo = BasicTaskInfo.extend({
    taskType: z.literal(SCAN_FOR_EXISTING_CONTENT_TASK_TYPE),
    result: ScanForExistingContentResult.nullable(),
});
export type ScanForExistingContentTaskInfo = z.infer<typeof ScanForExistingContentTaskInfo>;
export const isScanForExistingContentTaskInfo = (task?: any | null): task is ScanForExistingContentTaskInfo => {
    return task?.taskType === SCAN_FOR_EXISTING_CONTENT_TASK_TYPE;
};
