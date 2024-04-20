import { AppStartListening } from "../listener";
import { controlTaskPipeline, queryTasks, startDownload } from "./tasks.action";
import { TaskResponse } from "df-downloader-common";
import { addFetchListener } from "../utils";
import { API_URL } from "../../config";
import { z } from "zod";

export const startListeningTasks = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryTasks, TaskResponse, () => [`${API_URL}/tasks/list`]);
  addFetchListener(startListening, startDownload, z.any(), (payload) => [
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
};
