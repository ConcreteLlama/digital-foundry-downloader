import { ContentMoveFileInfo, logger, makeErrorMessage, MoveFilesTaskProgressInfo, MoveFilesTaskStatus } from "df-downloader-common";
import { BatchOperationTaskBuilder } from "../task-manager/task/batch-operation-task-builder.js";
import { moveFile } from "../utils/file-utils.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";

type MoveFilesTaskOpts = {
    overwrite: boolean;
    removeRecordIfMissing: boolean;
    db: DfDownloaderOperationalDb;
}


export const BatchMoveFilesTask = BatchOperationTaskBuilder(async (moveFileInfo: ContentMoveFileInfo, taskOpts: MoveFilesTaskOpts) => {
    try {
        await moveFile(moveFileInfo.oldFilename, moveFileInfo.newFilename, {
            clobber: taskOpts.overwrite,
            mkdirp: true,
        })
        const { missingFiles } = await taskOpts.db.moveDownload(moveFileInfo.contentName, moveFileInfo.oldFilename, moveFileInfo.newFilename);
        if (missingFiles.length) {
            // The file is already on disk at its new home, but nothing in the DB
            // matched it, so the record still points at the old path. That is a
            // failure of the operation as a whole - report it rather than
            // returning "moved", which is how this went unnoticed before.
            throw new Error(
                `Moved ${moveFileInfo.oldFilename} to ${moveFileInfo.newFilename}, but found no matching download record for content ${moveFileInfo.contentName} to update - the database still points at the old location`
            );
        }
        return "moved";
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            if (taskOpts.removeRecordIfMissing) {
                logger.log('debug', `File not found, removing record: ${moveFileInfo.contentName}: ${moveFileInfo.oldFilename}`);
                await taskOpts.db.removeDownload(moveFileInfo.contentName, moveFileInfo.oldFilename);
                return "recordRemoved";
            } else {
                throw new Error(`File not found: ${moveFileInfo.oldFilename}`);
            }                
        } else {
            throw e;
        }
    }
}, {
    taskType: "batch_move_files",
    idPrefix: 'batch-move-files',
});
export type BatchMoveFilesTask = ReturnType<typeof BatchMoveFilesTask>;
export const isBatchMoveFilesTask = (task: any): task is BatchMoveFilesTask => task.taskType === "batch_move_files";

export const makeMoveFilesTaskStatus = (task: BatchMoveFilesTask): MoveFilesTaskProgressInfo => {
    const taskStatus = task.getStatus();
    const results = taskStatus.moveStatuses.reduce((acc, status) => {
        acc.total += 1;
        if (status.startTime) {
            if (status.endTime) {
                acc.complete += 1;
                if (status.error) {
                    acc.failed += 1;
                } else {
                    if (status.result === "moved") {
                        acc.moved += 1;
                    } else if (status.result === "recordRemoved") {
                        acc.recordRemoved += 1;
                    }
                }
            } else {
                acc.moving += 1;
            }
        }
        return acc;
    }, {
        moved: 0,
        complete: 0,
        recordRemoved: 0,
        failed: 0,
        moving: 0,
        total: 0,
    });
    return {
        ...results,
        remaining: results.total - results.moved - results.failed,
    }
}
