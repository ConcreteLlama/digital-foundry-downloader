import { DownloadContentResponse, TaskResponse } from "df-downloader-common";
import { z } from "zod";
import { API_URL } from "../../config";
import { fetchSingleDfContentEntry } from "../df-content/df-content.action.ts";
import { AppStartListening } from "../listener";
import { addFetchListener } from "../utils";
import { controlTaskPipeline, queryTasks, startDownload } from "./tasks.action";

export const startListeningTasks = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryTasks, TaskResponse, () => [`${API_URL}/tasks/list`]);
  addFetchListener(startListening, startDownload, DownloadContentResponse, (payload) => [
    `${API_URL}/tasks/task`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  ]);
  addFetchListener(startListening, controlTaskPipeline, z.any(), (payload) => [
    `${API_URL}/tasks/control`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  ]);
  startListening({
    actionCreator: startDownload.success,
    effect: (action, api) => {
      api.dispatch(fetchSingleDfContentEntry.start(action.payload.name));
    },
  });
};
