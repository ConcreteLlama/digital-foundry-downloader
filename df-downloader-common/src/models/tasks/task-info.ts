import { z } from "zod";
import { DOWNLOAD_TASK_TYPE, DownloadTaskInfo } from "./download-task.js";
import { BasicTaskInfo } from "./base-task-info.js";
import { BATCH_MOVE_FILES_TASK_TYPE, MoveFilesTaskInfo } from "./move-files-task.js";
import { SCAN_FOR_EXISTING_CONTENT_TASK_TYPE, ScanForExistingContentTaskInfo } from "./scan-for-existing-files-task.js";
import { CLEAR_MISSING_FILES_TASK_TYPE, ClearMissingFilesTaskInfo } from "./clear-missing-files-task.js";
import { REMOVE_EMPTY_DIRS_TASK_TYPE, RemoveEmptyDirsTaskInfo } from "./remove-empty-dirs-task.js";

export const TaskInfo = z.any().transform((data) => {
  switch (data.taskType) {
    case DOWNLOAD_TASK_TYPE:
      return DownloadTaskInfo.parse(data);
    case BATCH_MOVE_FILES_TASK_TYPE:
      return MoveFilesTaskInfo.parse(data);
    case SCAN_FOR_EXISTING_CONTENT_TASK_TYPE:
      return ScanForExistingContentTaskInfo.parse(data);
    case CLEAR_MISSING_FILES_TASK_TYPE:
      return ClearMissingFilesTaskInfo.parse(data);
    case REMOVE_EMPTY_DIRS_TASK_TYPE:
      return RemoveEmptyDirsTaskInfo.parse(data);
    default:
      return BasicTaskInfo.parse(data);
  }
});
export type TaskInfo = z.infer<typeof TaskInfo>;
export const isTaskInfo = (task: any): task is TaskInfo => {
  return 'taskType' in task;
}

export const DfTaskType = z.enum(["download", "subtitles", "inject_metadata", "move_file", "batch_move_files", CLEAR_MISSING_FILES_TASK_TYPE, SCAN_FOR_EXISTING_CONTENT_TASK_TYPE]);
export type DfTaskType = z.infer<typeof DfTaskType>;

export const getTaskFriendlyName = (task: TaskInfo | DfTaskType): string => {
  let taskType: string;
  if (typeof task === "string") {
    taskType = task;
  } else {
    taskType = task.taskType;
  }
  switch (taskType as DfTaskType) {
    case "download":
      return "Download";
    case "subtitles":
      return "Fetch subtitles";
    case "inject_metadata":
      return "Inject metadata";
    case "move_file":
      return "Move file";
    case "batch_move_files":
      return "Move files";
    case CLEAR_MISSING_FILES_TASK_TYPE:
      return "Clear missing files";
    case SCAN_FOR_EXISTING_CONTENT_TASK_TYPE:
      return "Scan for existing files";
    default:
      return taskType;
  }
}