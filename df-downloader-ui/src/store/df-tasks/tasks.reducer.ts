import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { controlTaskAction, queryTasks } from "./tasks.action";
import { TasksState } from "./tasks.types";
import _ from "lodash";
import { isControlPipelineRequest } from "df-downloader-common";
import { taskEvents } from "./task-events.ts";

const INITIAL_STATE: TasksState = {
  loading: false,
  taskPipelineIds: [],
  taskPipelines: {},
  taskIds: [],
  tasks: {},
  error: null,
};
let firstFetch = true;

export const taskPipelinesReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryTasks, {
    success: (state, payload) => {
      const pipelineIds = payload.taskPipelines.map((pipeline) => pipeline.id);
      state.taskPipelineIds = _.isEqual(state.taskPipelineIds, pipelineIds) ? state.taskPipelineIds : pipelineIds;
      for (const newPipeline of payload.taskPipelines) {
        const currentPipeline = state.taskPipelines[newPipeline.id];
        if (!currentPipeline?.pipelineStatus.isComplete && newPipeline.pipelineStatus.isComplete) {
          taskEvents.emit("taskCompleted", {task: newPipeline, firstFetch});
        }
        if (currentPipeline) {
          if (currentPipeline.pipelineStatus.currentStep !== newPipeline.pipelineStatus.currentStep) {
            taskEvents.emit("taskUpdated", {task: newPipeline, firstFetch});
          }
          currentPipeline.pipelineStatus = newPipeline.pipelineStatus;
          for (const [stepId, taskInfo] of Object.entries(newPipeline.stepTasks)) {
            currentPipeline.stepTasks[stepId] = taskInfo;
          }
        } else {
          taskEvents.emit("taskAdded", {task: newPipeline, firstFetch});
          state.taskPipelines[newPipeline.id] = newPipeline;
        }
      }

      for (const pipelineId of Object.keys(state.taskPipelines)) {
        if (!pipelineIds.includes(pipelineId)) {
          taskEvents.emit("taskRemoved", {task: state.taskPipelines[pipelineId], firstFetch});
          delete state.taskPipelines[pipelineId];
        }
      }
      for (const newTask of payload.tasks) {
        const currentTask = state.tasks[newTask.id];
        if (!currentTask?.status?.isComplete && newTask.status?.isComplete) {
          taskEvents.emit("taskCompleted", {task: newTask, firstFetch});
        }
        if (currentTask) {
          if (currentTask.status !== newTask.status) {
            taskEvents.emit("taskUpdated", {task: newTask, firstFetch});
          }
          currentTask.status = newTask.status;
        } else {
          taskEvents.emit("taskAdded", {task: newTask, firstFetch});
        }
        state.tasks[newTask.id] = newTask;
      }
      for (const taskId of Object.keys(state.tasks)) {
        if (!payload.tasks.find((task) => task.id === taskId)) {
          taskEvents.emit("taskRemoved",{task: state.tasks[taskId], firstFetch});
          delete state.tasks[taskId];
        }
      }
      firstFetch = false;
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
