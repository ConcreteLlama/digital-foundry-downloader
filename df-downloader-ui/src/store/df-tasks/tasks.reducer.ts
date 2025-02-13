import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { controlTaskAction, queryTasks } from "./tasks.action";
import { DownloadQueueState as TasksState } from "./tasks.types";
import _ from "lodash";
import { isControlPipelineRequest } from "df-downloader-common";

const INITIAL_STATE: TasksState = {
  loading: false,
  taskPipelineIds: [],
  taskPipelines: {},
  taskIds: [],
  tasks: {},
  error: null,
};

export const taskPipelinesReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryTasks, {
    success: (state, payload) => {
      const pipelineIds = payload.taskPipelines.map((pipeline) => pipeline.id);
      state.taskPipelineIds = _.isEqual(state.taskPipelineIds, pipelineIds) ? state.taskPipelineIds : pipelineIds;
      for (const newPipeline of payload.taskPipelines) {
        const currentPipeline = state.taskPipelines[newPipeline.id];
        if (currentPipeline) {
          currentPipeline.pipelineStatus = newPipeline.pipelineStatus;
          for (const [stepId, taskInfo] of Object.entries(newPipeline.stepTasks)) {
            currentPipeline.stepTasks[stepId] = taskInfo;
          }
        } else {
          state.taskPipelines[newPipeline.id] = newPipeline;
        }
      }
      for (const pipelineId of Object.keys(state.taskPipelines)) {
        if (!pipelineIds.includes(pipelineId)) {
          delete state.taskPipelines[pipelineId];
        }
      }
      for (const newTask of payload.tasks) {
        state.tasks[newTask.id] = newTask;
      }
      for (const taskId of Object.keys(state.tasks)) {
        if (!payload.tasks.find((task) => task.id === taskId)) {
          delete state.tasks[taskId];
        }
      }
    },
  });
  addQueryCases(builder, controlTaskAction, {
    start: (state, payload) => {
      if (typeof payload.action === "object" && payload.action.action === "change_position" && isControlPipelineRequest(payload)) {
        const pipelneExec = state.taskPipelines[payload.pipelineExecutionId];
        const pipelineStepId = payload.stepId || pipelneExec.pipelineStatus.currentStep;
        if (!pipelineStepId) return;
        pipelneExec.stepTasks[pipelineStepId].position = payload.action.position;
      }
    },
  });
});
