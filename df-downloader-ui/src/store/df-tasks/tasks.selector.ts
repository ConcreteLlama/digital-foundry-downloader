import {
  DfPipelineType,
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
    // Guarded because this is no longer only called for failed pipelines -
    // CompletedTaskStatusDetail asks every completed one, including ids that
    // have just been cleared out from under it.
    const tasks = Object.entries(pipeline?.stepTasks ?? {});
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
  mediaFormat?: string;
  /** Narrows to one kind of pipeline, for a view that only cares about its own work. */
  pipelineType?: DfPipelineType;
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
  if (filter.contentName && pipeline.pipelineDetails.dfContent.key !== filter.contentName) return false;
  if (filter.mediaFormat && pipeline.pipelineDetails.mediaFormat !== filter.mediaFormat) return false;
  if (filter.pipelineType && pipeline.pipelineDetails.type !== filter.pipelineType) return false;
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
  // A step marked "not needed" (skipped) has no task object at all -
  // `!isDownloadTaskInfo(undefined)` is `true`, which used to misclassify
  // "nothing is actually happening on this step" as "post-processing".
  // Same underlying gap as pipelinePriorityComparator below.
  if (!task) return false;
  return !isDownloadTaskInfo(task);
};

const pipelinePriorityComparator = (a: TaskPipelineInfo, b: TaskPipelineInfo) => {
  const aTask = a.stepTasks[a.pipelineStatus.currentStep!];
  const bTask = b.stepTasks[b.pipelineStatus.currentStep!];
  // A pipeline whose current step is marked "not needed" (skipped) rather
  // than actually running has no task object for that step at all - treat
  // that as no priority ordering between the two sides rather than
  // crashing. Confirmed live: this blanked the whole app (no error
  // boundary exists anywhere to catch a render-time throw) when opening a
  // content item whose active pipeline was sitting on a skipped step.
  if (!aTask || !bTask) {
    return 0;
  }
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

/** Completed pipeline id to the title of the content it was for, for searching. */
export const selectCompletedTitles = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines): Record<string, string> => {
    const titles: Record<string, string> = {};
    for (const id of ids) {
      const pipeline = pipelines[id];
      if (pipeline?.pipelineStatus?.isComplete) {
        titles[id] = pipeline.pipelineDetails?.dfContent?.title ?? "";
      }
    }
    return titles;
  }
);

/**
 * When something finished, for ordering the completed list.
 *
 * A pipeline records no end time of its own - only its steps do - so it is
 * taken as the latest of theirs. Anything with no time at all sorts oldest,
 * which keeps it out of the way rather than pinning it to the top.
 */
const endedAt = (task?: { stepTasks?: Record<string, TaskInfo>; endTime?: Date }): number => {
  if (!task) {
    return 0;
  }
  if (task.stepTasks) {
    let latest = 0;
    for (const step of Object.values(task.stepTasks)) {
      latest = Math.max(latest, step.endTime ? new Date(step.endTime).getTime() : 0);
    }
    return latest;
  }
  return task.endTime ? new Date(task.endTime).getTime() : 0;
};

/** Newest first: what just finished is what you came to look at. */
export const selectCompletedPipelineIds = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines) => {
    return ids
      .filter((id) => pipelines[id]?.pipelineStatus?.isComplete)
      .sort((a, b) => endedAt(pipelines[b]) - endedAt(pipelines[a]));
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
    return Object.values(pipelines).filter((pipeline) => pipeline.pipelineDetails.dfContent.key === contentName);
  });

export const selectPipelineIdsForContent = (contentName: string, completionStatus: "complete" | "incomplete" | "all") =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, completionStatus), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => pipeline.id);
  });

export const selectActivePipelineIdsForContent = (contentName: string) =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, "incomplete"), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => !pipeline.pipelineStatus.isComplete && pipeline.id);
  });

export const selectActivePipelineIdsForMediaFormat = (contentName: string, mediaFormat: string) =>
  createDeepEqualSelector(selectPipelinesForContent(contentName, "incomplete"), (pipelines) => {
    return mapFilterFalsey(pipelines, (pipeline) => pipeline.pipelineDetails.mediaFormat === mediaFormat);
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

/*
  Standalone jobs, split by whether they have finished.

  Live ones belong with the work in progress; finished ones belong with the
  rest of the history, next to completed pipelines, so "Clear all" gathers
  everything finished in one place rather than leaving jobs to be dismissed
  one at a time.

  Deep-equal so a snapshot that changes nothing about the split does not hand
  back a new array and re-render the groups.
*/
/**
 * One live pipeline, reduced to what the Activity page needs to lay it out.
 *
 * Computed in a single pass rather than by the list asking per row, because
 * grouping, filtering and the drag lock all need the same few facts about
 * every item at once - and a hook per row cannot be called inside a loop.
 */
export type LaneItem = {
  pipelineId: string;
  pipelineType: DfPipelineType;
  /** What the work is on, for searching - the content's title. */
  title: string;
  state?: TaskState;
  /** Held out of the queue by hand - see TaskStatus.held. */
  held: boolean;
  running: boolean;
  /**
   * Whether this can be suspended once running.
   *
   * Load-bearing for reordering, not just for the buttons. Moving a running
   * task out of the concurrency window makes the task manager requeue it,
   * which is `pause("auto")` - and on a task that never implemented pause
   * that is a no-op, so the manager would believe it had freed the slot and
   * start another alongside work that is still going. Transcription is
   * exactly that case, so those rows are pinned.
   */
  canPause: boolean;
  /** Queue position, which running tasks occupy too - they are not a separate plane. */
  position: number;
  /**
   * The kind of work the current step is, which is also which queue it sits in.
   *
   * There is no single queue: downloads, media processing, DF requests and
   * bulk operations each have their own TaskManager and their own concurrency,
   * so `position` only means anything relative to others of the same kind.
   * Reordering across two of them would be comparing indices in different
   * lists, so the lane only offers dragging when its items agree on this.
   */
  taskType?: string;
};

export const selectLiveLaneItems = createDeepEqualSelector(
  [selectPipelineIds, selectPipelines],
  (ids, pipelines): LaneItem[] =>
    mapFilterEmpty(ids, (id) => {
      const pipeline = pipelines[id];
      if (!pipeline || pipeline.pipelineStatus.isComplete) {
        return undefined;
      }
      const currentStep = pipeline.pipelineStatus.currentStep;
      const task = currentStep ? pipeline.stepTasks[currentStep] : undefined;
      const state = task?.status?.state;
      return {
        pipelineId: pipeline.id,
        pipelineType: pipeline.pipelineType,
        title: pipeline.pipelineDetails?.dfContent?.title ?? "",
        state,
        held: Boolean(task?.status?.held),
        running: state === "running",
        canPause: Boolean(task?.capabilities?.includes("pause")),
        taskType: task?.taskType,
        // A step marked "not needed" has no task at all; sort those last
        // rather than letting NaN scramble the whole lane.
        position: task?.position ?? Number.MAX_SAFE_INTEGER,
      };
    }).sort((a, b) => a.position - b.position)
);

export const selectActiveTaskIds = createDeepEqualSelector(selectTaskIds, selectTasks, (ids, tasks) =>
  ids.filter((id) => !tasks[id]?.status?.isComplete)
);
/** Newest first, matching the completed pipelines above. */
export const selectCompletedTaskIds = createDeepEqualSelector(selectTaskIds, selectTasks, (ids, tasks) =>
  ids
    .filter((id) => Boolean(tasks[id]?.status?.isComplete))
    .sort((a, b) => endedAt(tasks[b]) - endedAt(tasks[a]))
);

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

export const selectScheduledDownloads = (state: RootState) => state.tasks.scheduledDownloads;
export const selectTaskManagers = (state: RootState) => state.tasks.taskManagers;
export const selectLocalCompute = (state: RootState) => state.tasks.localCompute;