import {
  DfTaskType,
  DownloadProgressInfo,
  TaskInfo,
  TaskPipelineInfo,
  TaskPipelineStatus,
  TaskState,
  isClearMissingFilesTaskInfo,
  isDownloadTaskInfo,
  isMoveFilesTaskInfo,
  mapFilterEmpty,
  mapFilterFalsey
} from "df-downloader-common";
import _ from "lodash";
import { createSelector } from "reselect";
import { RootState } from "../store.ts";
import { createDeepEqualSelector } from "../utils.ts";

const selectPipelines = (state: RootState) => state.tasks.taskPipelines;
export const selectPipelineIds = (state: RootState) => state.tasks.taskPipelineIds;
export const selectPipeline = (pipelineId: string) =>
  createSelector(selectPipelines, (pipelines) => pipelines[pipelineId]);

export const selectPipelinesInCompletionState = (completionState: "complete" | "incomplete" | "all") =>
  createSelector(selectPipelines, (pipelines) => {
    return Object.values(pipelines).filter(
      (pipeline) => completionState === "all" || pipeline.pipelineStatus.isComplete === (completionState === "complete")
    );
  });

export const selectPipelineErrors = (pipelineId: string) =>
  createDeepEqualSelector(selectPipelines, (pipelines) => {
    const pipeline = pipelines[pipelineId];
    const tasks = Object.entries(pipeline.stepTasks);
    const errors = mapFilterEmpty(tasks, ([, task]) => task.status?.error);
    return errors;
  });

export const selectPipelineStatus = (pipelineId: string) =>
  createDeepEqualSelector(selectPipelines, (pipelines) => pipelines[pipelineId]?.pipelineStatus);

export const selectPipelinesFromIds = (pipelineIds: string[]) =>
  createSelector(selectPipelines, (pipelines) => mapFilterFalsey(pipelineIds, (id) => pipelines[id]));

export const selectPipelineDetails = (pipelineId: string) =>
  createSelector(selectPipelines, (pipelines) => pipelines[pipelineId]?.pipelineDetails);

export const selectPipelineField = <K extends keyof TaskPipelineInfo>(pipelineId: string, field: K) =>
  createDeepEqualSelector(selectPipeline(pipelineId), (pipeline) => pipeline?.[field]);

export const selectDetailsForPipelineIds = (pipelineIds: string[]) =>
  createDeepEqualSelector(selectPipelines, (pipelines) =>
    mapFilterFalsey(pipelineIds, (id) => pipelines[id]?.pipelineDetails)
  );

export const selectIsComplete = (pipelineId: string) =>
  createSelector(selectPipelineStatus(pipelineId), (status) => status?.isComplete);

export const selectCurrentStep = (pipelineId: string) =>
  createSelector(selectPipelineStatus(pipelineId), (status) => status?.currentStep);

export const selectPipelineTask = (pipelineId: string, stepId: string) =>
  createSelector(selectPipelines, (pipelines) => pipelines[pipelineId]?.stepTasks[stepId]);

export const selectCurrentStepAndPipeline = (pipelineId: string) =>
  createSelector([selectCurrentStep(pipelineId), selectPipeline(pipelineId)], (stepId, pipeline) => ({
    stepId,
    pipeline,
  }));

export const selectCurrentTask = (pipelineId: string) =>
  createSelector(selectCurrentStepAndPipeline(pipelineId), ({ stepId, pipeline }) => pipeline?.stepTasks[stepId || ""]);

export const selectTaskStatus = (pipelineId: string, stepId: string) =>
  createSelector(selectPipelineTask(pipelineId, stepId), (task) => task?.status);

export const selectTaskStatusField = <
  K extends keyof NonNullable<TaskInfo["status"]>,
  V = NonNullable<TaskInfo["status"]>[K]
>(
  pipelineId: string,
  stepId: string,
  field: K
) => createDeepEqualSelector(selectTaskStatus(pipelineId, stepId), (status) => status?.[field] as V);

export const selectTaskState = (pipelineId: string, stepId: string) =>
  createSelector(selectPipelineTask(pipelineId, stepId), (task) => task?.status?.state);

export const selectBasicTaskField = <K extends keyof TaskInfo, V = TaskInfo[K]>(
  pipelineId: string,
  stepId: string,
  field: K
) => createDeepEqualSelector(selectPipelineTask(pipelineId, stepId), (task) => task?.[field] as V);

type PipelineFilter = {
  contentName?: string;
  mediaType?: string;
  state?: "downloading" | "post-processing" | "complete" | "incomplete" | "all";
};

type PipelineSort = {
  by: "priority";
  order: "asc" | "desc";
};

type PipelineQuery = {
  filter?: PipelineFilter;
  sort?: PipelineSort;
};

const applyFilter = (pipeline: TaskPipelineInfo, filter?: PipelineFilter) => {
  if (!filter) return true;
  if (filter.contentName && pipeline.pipelineDetails.dfContent.name !== filter.contentName) return false;
  if (filter.mediaType && pipeline.pipelineDetails.mediaType !== filter.mediaType) return false;
  if (filter.state === "downloading") return pipelineIsDownloading(pipeline);
  if (filter.state === "post-processing") return pipelineIsPostProcessing(pipeline);
  if (filter.state === "complete") return pipeline.pipelineStatus.isComplete;
  if (filter.state === "incomplete") return !pipeline.pipelineStatus.isComplete;
  return true;
};

export const selectQueryPipelineIds = (query?: PipelineQuery) =>
  createDeepEqualSelector([selectPipelineIds, selectPipelines], (ids, pipelines) => {
    return ids
      .filter((id) => applyFilter(pipelines[id], query?.filter))
      .sort((a, b) => {
        const sort = query?.sort || {
          by: "priority",
          order: "asc",
        };
        if (sort.by === "priority") {
          return sort.order === "asc"
            ? pipelinePriorityComparator(pipelines[a], pipelines[b])
            : pipelinePriorityComparator(pipelines[b], pipelines[a]);
        }
        return 0;
      });
  });

const pipelineIsDownloading = (pipeline?: TaskPipelineInfo) => {
  const currentStep = pipeline?.pipelineStatus.currentStep;
  if (!currentStep) return;
  const pipelineCompleted = pipeline.pipelineStatus.isComplete;
  if (pipelineCompleted) return;
  const task = pipeline.stepTasks[currentStep];
  return isDownloadTaskInfo(task);
};

const pipelineIsPostProcessing = (pipeline?: TaskPipelineInfo) => {
  if (pipeline?.pipelineStatus.isComplete) return;
  const currentStep = pipeline?.pipelineStatus.currentStep;
  if (!currentStep) return;
  const task = pipeline?.stepTasks[currentStep];
  return !isDownloadTaskInfo(task);
};

const pipelinePriorityComparator = (a: TaskPipelineInfo, b: TaskPipelineInfo) => {
  const aTask = a.stepTasks[a.pipelineStatus.currentStep!];
  const bTask = b.stepTasks[b.pipelineStatus.currentStep!];
  return aTask.position - bTask.position;
};

export const selectDownloadingPipelineIds = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines) => {
    return ids
      .filter((id) => {
        const pipeline = pipelines[id];
        return pipelineIsDownloading(pipeline);
      })
      .sort((a, b) => {
        return pipelinePriorityComparator(pipelines[a], pipelines[b]);
      });
  }
);

export const selectPostProcessingPipelineIds = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines) => {
    return ids.filter((id) => {
      const pipeline = pipelines[id];
      return pipelineIsPostProcessing(pipeline);
    });
  }
);

export const selectCompletedPipelineIds = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines) => {
    return ids.filter((id) => pipelines[id]?.pipelineStatus?.isComplete);
  }
);

export const selectPipelineStatuses = createSelector(
  selectPipelines,
  (taskPipelines) => {
    const pipelineStatuses: Record<string, TaskPipelineStatus> = {};
    for (const [id, pipeline] of Object.entries(taskPipelines)) {
      pipelineStatuses[id] = pipeline.pipelineStatus;
    }
    return pipelineStatuses;
  },
  {
    memoizeOptions: {
      resultEqualityCheck: (a, b) => _.isEqual(a, b),
    },
  }
);

export const selectPipelinesForContent = (
  contentName: string,
  completionStatus: "complete" | "incomplete" | "all" = "all"
) =>
  createSelector(selectPipelinesInCompletionState(completionStatus), (pipelines) => {
    return Object.values(pipelines).filter((pipeline) => pipeline.pipelineDetails.dfContent.name === contentName);
  });

export const selectPipelineIdsForContent = (contentName: string, completionStatus: "complete" | "incomplete" | "all") =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, completionStatus), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => pipeline.id);
  });

export const selectActivePipelineIdsForContent = (contentName: string) =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, "incomplete"), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => !pipeline.pipelineStatus.isComplete && pipeline.id);
  });

export const selectActivePipelineIdsForMediaType = (contentName: string, mediaType: string) =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, "incomplete"), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => pipeline.pipelineDetails.mediaType === mediaType);
  });

export const selectDownloadTask = (pipelineId: string, stepId: string) =>
  createSelector(selectPipelineTask(pipelineId, stepId), (task) => {
    if (!isDownloadTaskInfo(task)) return;
    return task;
  });

export const selectDownoadingProgressField = <
  K extends keyof NonNullable<DownloadProgressInfo>,
  V = DownloadProgressInfo[K]
>(
  pipelineId: string,
  stepId: string,
  key: K
) => createSelector(selectDownloadTask(pipelineId, stepId), (task) => task?.status?.currentProgress?.[key] as V);



type TaskFilter = {
  state?: TaskState;
  taskType?: DfTaskType;
}
type TaskSort = {
  by: "priority";
  order: "asc" | "desc";
};
type TaskQuery = {
  filter?: TaskFilter;
  sort?: TaskSort;
};

const selectTasks = (state: RootState) => state.tasks.tasks;
export const selectTaskIds = (state: RootState) => state.tasks.taskIds;
export const selectTask = (taskId: string) =>
  createSelector(selectTasks, (tasks) => tasks[taskId]);

const applyTaskFilter = (task: TaskInfo, filter?: TaskFilter) => {
  if (!filter) return true;
  if (filter.state && task.status?.state !== filter.state) return false;
  if (filter.taskType && task.taskType !== filter.taskType) return false;
  return true;
};

const taskPriorityComparator = (a: TaskInfo, b: TaskInfo) => {
  return a.priority - b.priority;
};

export const selectQueryTaskIds = (query?: TaskQuery) =>
  createDeepEqualSelector([selectTaskIds, selectTasks], (ids, tasks) => {
    return ids
      .filter((id) => applyTaskFilter(tasks[id], query?.filter))
      .sort((a, b) => {
        const sort = query?.sort || {
          by: "priority",
          order: "asc",
        };
        if (sort.by === "priority") {
          return sort.order === "asc"
            ? taskPriorityComparator(tasks[a], tasks[b])
            : taskPriorityComparator(tasks[b], tasks[a]);
        }
        return 0;
      });
  });

export const selectQueryTasks = (query?: TaskQuery) =>
  createDeepEqualSelector([selectQueryTaskIds(query), selectTasks], (ids, tasks) => {
    return mapFilterFalsey(ids, (id) => tasks[id]);
  });

export const selectTasksByType = (taskType: DfTaskType) =>
  createDeepEqualSelector(selectTasks, (tasks) => Object.values(tasks).filter((task) => task.taskType === taskType));

export const selectTasksByIs = <T extends TaskInfo>(is: (value: any) => value is T) => 
  createDeepEqualSelector(selectTasks, (tasks) => Object.values(tasks).filter(is) as T[]);

export const selectBatchMoveFilesTasks = createDeepEqualSelector(
  selectTasksByIs(isMoveFilesTaskInfo),
  (tasks) => tasks,
);

export const selectClearMissingFilesTasks = createDeepEqualSelector(
  selectTasksByIs(isClearMissingFilesTaskInfo),
  (tasks) => tasks,
);