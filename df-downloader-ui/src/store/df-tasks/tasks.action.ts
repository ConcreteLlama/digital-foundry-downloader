import { AddTaskRequest, ControlRequest, DownloadContentResponse, HtmlImportRequest, ManualDownloadRequest, TasksResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

export const queryTasks = createQueryActions<void, TasksResponse>("tasks", "QUERY_TASKS");
export const startDownload = createQueryActions<AddTaskRequest, DownloadContentResponse>("tasks", "START_DOWNLOAD");
export const startManualDownload = createQueryActions<ManualDownloadRequest, DownloadContentResponse>("tasks", "START_MANUAL_DOWNLOAD");
export const importHtmlContent = createQueryActions<HtmlImportRequest, any>("tasks", "IMPORT_HTML_CONTENT");
export const controlTaskAction = createQueryActions<ControlRequest, void>("tasks", "CONTROL_TASK");
