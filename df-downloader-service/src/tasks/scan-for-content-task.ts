import { SCAN_FOR_EXISTING_CONTENT_TASK_TYPE } from "df-downloader-common";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { taskify } from "../task-manager/utils.js";

const scanForExistingContent = async (contentManager: DigitalFoundryContentManager) => {
    const foundFiles = await contentManager.scanForExistingFiles();
    return {
        foundFiles,
    }
}

export const ScanForExistingContentTask = taskify(scanForExistingContent, {
    taskType: SCAN_FOR_EXISTING_CONTENT_TASK_TYPE,
    idPrefix: 'scan-for-existing-content',
})
export type ScanForExistingContentTask = ReturnType<typeof ScanForExistingContentTask>;
export const isScanForExistingContentTask = (task: any): task is ScanForExistingContentTask => task.taskType === SCAN_FOR_EXISTING_CONTENT_TASK_TYPE;