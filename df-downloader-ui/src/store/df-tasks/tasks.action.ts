import { AddTaskRequest, ControlRequest, DownloadContentResponse, TasksResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryTasks = createQueryActions<void, TasksResponse>("tasks", "QUERY_TASKS");
export const startDownload = createQueryActions<AddTaskRequest, DownloadContentResponse>("tasks", "START_DOWNLOAD");
export const controlTaskAction = createQueryActions<ControlRequest, void>("tasks", "CONTROL_TASK");
