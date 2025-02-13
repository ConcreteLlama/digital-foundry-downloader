import { ControlRequest, TaskAction } from "df-downloader-common";
import { controlTaskAction } from "../store/df-tasks/tasks.action.ts";
import { store } from "../store/store.ts";
import { postJson } from "../utils/fetch.ts";
import { API_URL } from "../config.ts";

export const sendTaskControlRequest = async (request: ControlRequest) => {
    store.dispatch(controlTaskAction.start(request));
};

export const clearCompletedPipelines = async () => {
    await postJson(`${API_URL}/tasks/clear-completed`, {});
  };

export const clearTask = async (taskId: string) => controlTask(taskId, "clear");

export const controlTask = async (taskId: string, action: TaskAction) => {
    return sendTaskControlRequest({
        action,
        taskId,
    });
};

export const clearPipeline = async (pipelineExecutionId: string) => controlPipeline(pipelineExecutionId, "clear");

export const controlPipeline = async (pipelineExecutionId: string, action: TaskAction) => {
    return sendTaskControlRequest({
        action,
        pipelineExecutionId,
    });
};