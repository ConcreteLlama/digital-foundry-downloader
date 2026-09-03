import { ContentMoveFileInfo, logger, makeErrorMessage, MoveFilesTaskProgressInfo, MoveFilesTaskStatus } from "df-downloader-common";
import { BatchOperationTaskBuilder } from "../task-manager/task/batch-operation-task-builder.js";
import { moveFile } from "../utils/file-utils.js";
import { serviceLocator } from "../services/service-locator.js";
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
        /*
         * Both ends, because a move changes two directories: the file is gone
         * from one and new in the other. Telling a server only about the
         * destination leaves it showing an entry that no longer exists.
         *
         * Announced here rather than after the database update below - this is
         * the point at which the disk actually changed, and that remains true
         * even if the record update then fails.
         */
        serviceLocator.mediaServers.fileChanged(moveFileInfo.oldFilename, "moved");
        serviceLocator.mediaServers.fileChanged(moveFileInfo.newFilename, "moved");
        /*
         * Sidecars travel with the video, and their failures are contained.
         *
         * Deliberately caught per file rather than allowed to escape: an
         * absent .srt must not fail the video's move, and must certainly not
         * reach the ENOENT branch below, which would remove the download
         * record for a file that is present and correct.
         */
        const movedSidecars: { oldFilename: string; newFilename: string }[] = [];
        for (const sidecar of moveFileInfo.sidecars ?? []) {
            try {
                await moveFile(sidecar.oldFilename, sidecar.newFilename, {
                    clobber: taskOpts.overwrite,
                    mkdirp: true,
                });
                movedSidecars.push(sidecar);
                serviceLocator.mediaServers.fileChanged(sidecar.oldFilename, "moved");
                serviceLocator.mediaServers.fileChanged(sidecar.newFilename, "moved");
            } catch (e: any) {
                logger.log(
                    "warn",
                    `Moved ${moveFileInfo.contentName} but could not move its subtitle file ${sidecar.oldFilename}: ${e?.message ?? e}`
                );
            }
        }
        const { missingFiles } = await taskOpts.db.moveDownload(
            moveFileInfo.contentName,
            moveFileInfo.oldFilename,
            moveFileInfo.newFilename,
            movedSidecars
        );
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
