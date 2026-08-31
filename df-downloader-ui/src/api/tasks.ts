import { ControlAllResponse, ControlRequest, TaskAction, parseResponseBody } from "df-downloader-common";
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

/**
 * Pause or resume the whole queue.
 *
 * A single request rather than one per task: the point is one instruction, and
 * firing thirty would have thirty chances to half-apply. Best-effort by
 * design - the response says how much of it took, because some running work
 * cannot stop where it is.
 */
export const controlAllTasks = async (action: "pause" | "resume" | "stop"): Promise<ControlAllResponse> => {
    const response = await postJson(`${API_URL}/tasks/control-all`, { action });
    const parsed = parseResponseBody(response, ControlAllResponse);
    if (parsed.error || parsed.data === undefined) {
        throw new Error(parsed.error?.message ?? "Unexpected response from the server");
    }
    return parsed.data;
};
