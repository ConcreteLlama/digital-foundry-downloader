import { AddTaskRequest, ControlPipelineRequest, DownloadContentResponse, TaskResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryTasks = createQueryActions<void, TaskResponse>("tasks", "QUERY_TASKS");
export const startDownload = createQueryActions<AddTaskRequest, DownloadContentResponse>("tasks", "START_DOWNLOAD");
export const controlTaskPipeline = createQueryActions<ControlPipelineRequest, void>("tasks", "CONTROL_TASK");
