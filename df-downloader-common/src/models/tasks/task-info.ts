import { z } from "zod";
import { DOWNLOAD_TASK_TYPE, DownloadTaskInfo } from "./download-task.js";
import { BasicTaskInfo } from "./base-task-info.js";
import { BATCH_MOVE_FILES_TASK_TYPE, MoveFilesTaskInfo } from "./move-files-task.js";
import { SCAN_FOR_EXISTING_CONTENT_TASK_TYPE, ScanForExistingContentTaskInfo } from "./scan-for-existing-files-task.js";
import { CLEAR_MISSING_FILES_TASK_TYPE, ClearMissingFilesTaskInfo } from "./clear-missing-files-task.js";
import { REMOVE_EMPTY_DIRS_TASK_TYPE, RemoveEmptyDirsTaskInfo } from "./remove-empty-dirs-task.js";

export const TaskTypeMap: Record<string, z.ZodType<any, any, any>> = {
  [DOWNLOAD_TASK_TYPE]: DownloadTaskInfo,
  [BATCH_MOVE_FILES_TASK_TYPE]: MoveFilesTaskInfo,
  [SCAN_FOR_EXISTING_CONTENT_TASK_TYPE]: ScanForExistingContentTaskInfo,
  [CLEAR_MISSING_FILES_TASK_TYPE]: ClearMissingFilesTaskInfo,
  [REMOVE_EMPTY_DIRS_TASK_TYPE]: RemoveEmptyDirsTaskInfo,
};

export const TaskInfo = z.any().transform((data) => {
  const schema = TaskTypeMap[data.taskType];
  return schema ? schema.parse(data) : BasicTaskInfo.parse(data);
});
export type TaskInfo = z.infer<typeof TaskInfo>;
export const isTaskInfo = (task: any): task is TaskInfo => {
  return 'taskType' in task;
}

export const DfTaskType = z.enum(["download", "subtitles", "inject_metadata", "move_file", "batch_move_files", CLEAR_MISSING_FILES_TASK_TYPE, SCAN_FOR_EXISTING_CONTENT_TASK_TYPE]);
export type DfTaskType = z.infer<typeof DfTaskType>;
