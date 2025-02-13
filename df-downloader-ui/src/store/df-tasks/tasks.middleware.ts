import { fetchSingleDfContentEntry } from "../df-content/df-content.action.ts";
import { RootState } from "../store.ts";
import { queryTasks } from "./tasks.action.ts";

import { Middleware } from "@reduxjs/toolkit";

/**
 * Middleware to re-fetch the df content entry when a task is completed.
 */
export const tasksMiddleware: Middleware = (storeApi) => (next) => (action) => {
  const prevState = storeApi.getState() as RootState;
  next(action);
  const newState = storeApi.getState() as RootState;
  if (queryTasks.success.match(action)) {
    const prevCompletedTasks = new Map<string, string>();
    for (const task of Object.values(prevState.tasks.taskPipelines)) {
      if (task.pipelineStatus.isComplete) {
        prevCompletedTasks.set(task.id, task.pipelineDetails.dfContent.name);
      }
    }
    for (const task of Object.values(newState.tasks.taskPipelines)) {
      if (task.pipelineStatus.isComplete) {
        if (!prevCompletedTasks.has(task.id)) {
          const dfContentName = task.pipelineDetails.dfContent.name;
          storeApi.dispatch(fetchSingleDfContentEntry.start(dfContentName));
        }
      }
    }
  }
};
