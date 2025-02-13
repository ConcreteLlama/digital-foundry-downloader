import { promises as fs } from 'fs';
import { taskify } from '../task-manager/utils.js';
import { REMOVE_EMPTY_DIRS_TASK_TYPE } from 'df-downloader-common';

const removeEmptyDirs = async (dirPath: string) => {
    let removedDirs: string[] = [];
    let files = await fs.readdir(dirPath);
    for (const file of files) {
        const filePath = `${dirPath}/${file}`;
        const stat = await fs.stat(filePath);
        if (stat.isDirectory()) {
            removedDirs.push(...await removeEmptyDirs(filePath));
        }
    }
    files = await fs.readdir(dirPath);
    if (files.length === 0) {
        await fs.rmdir(dirPath);
        removedDirs.push(dirPath);
    }
    return removedDirs;
};

export const RemoveEmptyDirsTask = taskify(removeEmptyDirs, {
    'taskType': REMOVE_EMPTY_DIRS_TASK_TYPE,
});
export type RemoveEmptyDirsTask = ReturnType<typeof RemoveEmptyDirsTask>;

export const isRemoveEmptyDirsTask = (task: any): task is RemoveEmptyDirsTask => {
    return task?.taskType === REMOVE_EMPTY_DIRS_TASK_TYPE;
};