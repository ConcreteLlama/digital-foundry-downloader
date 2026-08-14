import { DownloadContentResponse, TasksResponse } from "df-downloader-common";
import { z } from "zod";
import { API_URL } from "../../config";
import { fetchSingleDfContentEntry, queryDfContent } from "../df-content/df-content.action.ts";
import { AppStartListening } from "../listener";
import { addFetchListener } from "../utils";
import { controlTaskAction, importHtmlContent, queryTasks, startDownload, startManualDownload } from "./tasks.action";

export const startListeningTasks = (startListening: AppStartListening) => {
  addFetchListener(startListening, queryTasks, TasksResponse, () => [`${API_URL}/tasks/list`]);
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
  addFetchListener(startListening, startManualDownload, DownloadContentResponse, (payload) => [
    `${API_URL}/tasks/manual`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  ]);
  addFetchListener(startListening, importHtmlContent, z.any(), (payload) => [
    `${API_URL}/tasks/import-html`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  ]);
  addFetchListener(startListening, controlTaskAction, z.any(), (payload) => [
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
      api.dispatch(fetchSingleDfContentEntry.start(action.payload.key));
    },
  });
  startListening({
    actionCreator: startManualDownload.success,
    effect: (action, api) => {
      api.dispatch(fetchSingleDfContentEntry.start(action.payload.key));
    },
  });
  startListening({
    actionCreator: importHtmlContent.success,
    effect: (_action, api) => {
      // Refresh the entire content list since we may have imported multiple items
      api.dispatch(queryDfContent.start());
    },
  });
};
