import { CLEAR_MISSING_FILES_TASK_TYPE, logger } from "df-downloader-common";
import { serviceLocator } from "../services/service-locator.js";
import { fileExists } from "../utils/file-utils.js";
import { TaskControllerTaskBuilder } from "../task-manager/task/task-controller-task.js";

type ClearMissingFilesResult = {
    removedFileReferences: string[];
}
type ClearMissingFilesStatus = {
    removedFileReferenceCount: number;
    totalToScan: number;
    totalScanned: number;
}
type ClearMissingFilesContext = {
    infos: BasicDownloadInfo[];
    scanned: number;
    removedFileReferences: string[];
}
type BasicDownloadInfo = {
    contentName: string;
    downloadLocation: string;
}
const clearMissingFiles = async (context: ClearMissingFilesContext) => {
    const { infos, removedFileReferences } = context;
    const db = serviceLocator.db;
    const allContentEntries = await db.getAllContentEntries();
    const allDownloadEntries = allContentEntries.reduce((acc: BasicDownloadInfo[], contentEntry) => {
        acc.push(...contentEntry.downloads.map(download => ({
            contentName: contentEntry.name,
            downloadLocation: download.downloadLocation,
        })));
        return acc;
    }, [])
    infos.push(...allDownloadEntries);
    for (const { downloadLocation, contentName } of allDownloadEntries) {
        if (!await fileExists(downloadLocation)) {
            logger.log('info', `File ${downloadLocation} no longer exists, removing from database`);
            await db.removeDownload(contentName, downloadLocation);
            removedFileReferences.push(downloadLocation);
        }
        context.scanned++;
    }
    return {
        removedFileReferences,
    }
}

const clearMissingFilesTaskBuilder = TaskControllerTaskBuilder<ClearMissingFilesResult, ClearMissingFilesContext, ClearMissingFilesStatus>({
    start: clearMissingFiles,
    getStatus(context) {
        return {
            removedFileReferenceCount: context.removedFileReferences.length,
            totalToScan: context.infos.length,
            totalScanned: context.scanned,
        }
    },
});

export const ClearMissingFilesTask = () => clearMissingFilesTaskBuilder({
    removedFileReferences: [],
    infos: [],
    scanned: 0,
}, {
    taskType: CLEAR_MISSING_FILES_TASK_TYPE,
    idPrefix: 'clear-missing-files',
});
export type ClearMissingFilesTask = ReturnType<typeof ClearMissingFilesTask>;
export const isClearMissingFilesTask = (task: any): task is ClearMissingFilesTask => task.taskType === CLEAR_MISSING_FILES_TASK_TYPE;