import {
  BasicTaskInfo,
  ControlPipelineRequest,
  DfContentInfo,
  DownloadTaskInfo,
  DownloadTaskStatus,
  LanguageCode,
  MediaInfo,
  StepDetails,
  TaskPipelineAction,
  TaskPipelineInfo,
  TaskPipelineUtils,
  getMediaType,
  isChangePositionAction,
  isChangePriorityAction,
  isShiftAction,
  makeErrorMessage,
} from "df-downloader-common";
import { configService } from "./config/config.js";
import { makeDfDownloadParams } from "./df-fetcher.js";
import { DownloadContextStatus } from "./download/downloader/fsm/download-context.js";
import { SubtitleGenerator } from "./media-utils/subtitles/subtitles.js";
import { serviceLocator } from "./services/service-locator.js";
import { PriorityPositionInfo } from "./task-manager/priority-item-manager.js";
import { TaskManager } from "./task-manager/task-manager.js";
import {
  isPipelineExecutionFailedResult,
  isPipelineExecutionSuccessResult,
} from "./task-manager/task-pipeline/task-pipeline.types.js";
import { GenericManagedTask, ManagedTask } from "./task-manager/task/task-manager-task.js";
import { Task } from "./task-manager/task/task.js";
import {
  DownloadTaskPipeline,
  DownloadTaskPipelineExecution,
  createDownloadTaskPipeline,
} from "./task-pipelines/download-task-pipeline.js";
import {
  SubtitlesTaskPipeline,
  SubtitlesTaskPipelineExecution,
  createSubtitlesTaskPipeline,
} from "./task-pipelines/subtitles-task-pipeline.js";
import { DownloadTask, DownloadTaskManager, isDownloadTask } from "./tasks/download-task.js";
import { SubtitlesTaskManager } from "./tasks/subtitles-task.js";

type DfTaskManagerOpts = {
  autoClearCompletedPipelines?: boolean;
};

/**
 * This class is responsible for managing the task pipelines for downloading and generating subtitles (and any
 * other task pipelines that may be added in the future).
 */
export class DfTaskManager {
  readonly downloadTaskManager: DownloadTaskManager;
  readonly subtitlesTaskManager: SubtitlesTaskManager;
  readonly fileTaskManager: TaskManager;

  readonly subtitleTaskPipeline: SubtitlesTaskPipeline;
  readonly downloadTaskPipeline: DownloadTaskPipeline;

  readonly pipelineExecutions = new Map<string, SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution>();

  autoClearCompletedPipelines: boolean;

  constructor({ autoClearCompletedPipelines = false }: DfTaskManagerOpts = {}) {
    this.autoClearCompletedPipelines = autoClearCompletedPipelines;
    const downloadConfig = configService.config.downloads;

    this.downloadTaskManager = new DownloadTaskManager({
      concurrentTasks: downloadConfig.maxSimultaneousDownloads,
      retries: {
        maxRetries: downloadConfig.maxRetries,
        retryDelay: downloadConfig.failureRetryIntervalBase,
        retryDelayMultiplier: 2,
      },
    });
    this.fileTaskManager = new TaskManager({
      concurrentTasks: 5,
    });
    this.subtitlesTaskManager = new SubtitlesTaskManager({
      concurrentTasks: 5,
    });
    this.subtitleTaskPipeline = createSubtitlesTaskPipeline({
      subtitlesTaskManager: this.subtitlesTaskManager,
      fileTaskManager: this.fileTaskManager,
    });
    this.downloadTaskPipeline = createDownloadTaskPipeline({
      downloadTaskManager: this.downloadTaskManager,
      subtitlesTaskManager: this.subtitlesTaskManager,
      fileTaskManager: this.fileTaskManager,
    });
  }

  private addTaskPipelineExecution(pipelineExecution: SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution) {
    this.pipelineExecutions.set(pipelineExecution.id, pipelineExecution);
    pipelineExecution.once("completed", () => {
      if (this.autoClearCompletedPipelines) {
        this.clearCompletedTask(pipelineExecution.id);
      }
    });
  }

  downloadContent(dfContentInfo: DfContentInfo, mediaInfo: MediaInfo) {
    const { url, destination: downloadLocation, headers } = makeDfDownloadParams(dfContentInfo, mediaInfo);
    const downloadExecution = this.downloadTaskPipeline.start({
      dfContentInfo,
      mediaInfo,
      url,
      downloadLocation,
      headers,
    });
    serviceLocator.notifier.downloadQueued(dfContentInfo);
    downloadExecution.once("stepTaskStarted", () => {
      serviceLocator.notifier.downloadStarting(dfContentInfo, mediaInfo);
    });
    downloadExecution.once("completed", (result) => {
      const notifier = serviceLocator.notifier;
      if (isPipelineExecutionFailedResult(result)) {
        notifier.downloadFailed(dfContentInfo, result.error);
        return;
      } else if (isPipelineExecutionSuccessResult(result)) {
        notifier.downloadComplete(
          dfContentInfo,
          mediaInfo,
          downloadLocation,
          makeDownloadProgressInfo(result.pipelineResult.finalDownloadStatus!, result.pipelineResult.attempts || 1)
        );
      }
    });
    this.addTaskPipelineExecution(downloadExecution);
    return downloadExecution;
  }

  generateSubs(
    dfContentInfo: DfContentInfo,
    mediaInfo: MediaInfo,
    fileLocation: string,
    language: LanguageCode,
    subtitleGenerators: SubtitleGenerator | SubtitleGenerator[]
  ) {
    const subtitleExecution = this.subtitleTaskPipeline.start({
      dfContentInfo,
      mediaInfo,
      fileLocation,
      language,
      subtitleGenerators,
    });
    this.addTaskPipelineExecution(subtitleExecution);
    return subtitleExecution;
  }

  clearCompletedTasks() {
    this.pipelineExecutions.forEach((execution, name) => {
      if (execution.isCompleted) {
        this.pipelineExecutions.delete(name);
      }
    });
  }

  clearCompletedTask(id: string) {
    const execution = this.pipelineExecutions.get(id);
    if (execution && execution.isCompleted) {
      this.pipelineExecutions.delete(id);
    }
  }

  private controlTaskManagerTask(managedTask: GenericManagedTask, action: TaskPipelineAction) {
    if (isChangePriorityAction(action)) {
      managedTask.changePriority(action.priority);
    } else if (isShiftAction(action)) {
      managedTask.shiftTask(action.direction, action.allowPriorityChange);
    } else if (isChangePositionAction(action)) {
      managedTask.changePosition(action.position);
    } else {
      switch (action) {
        case "pause":
          managedTask.task.pause("manual");
          break;
        case "resume":
          managedTask.resume();
          break;
        case "cancel":
          managedTask.task.cancel();
          break;
        case "force_start":
          managedTask.forceStart();
          break;
      }
    }
  }

  controlPipeline(controlPipelineRequest: ControlPipelineRequest) {
    const { pipelineExecutionId, stepId, action } = controlPipelineRequest;
    const pipeline = this.pipelineExecutions.get(pipelineExecutionId);
    if (!pipeline) {
      throw new Error(`No task with id ${pipelineExecutionId}`);
    }
    if (action === "clear") {
      this.clearCompletedTask(pipelineExecutionId);
      return;
    }
    const step = stepId ? pipeline.getStepById(stepId) : pipeline.getCurrentStep();
    const managedTask = step?.managedTask as GenericManagedTask | undefined;
    if (!managedTask?.task) {
      throw new Error(`No curent task for taskInfo ${pipelineExecutionId}`);
    }
    this.controlTaskManagerTask(managedTask, action);
  }

  private getTaskPipelineExecutionArray() {
    return Array.from(this.pipelineExecutions.values());
  }

  getPipelineInfo(id: string): TaskPipelineInfo | undefined {
    const pipeline = this.pipelineExecutions.get(id);
    return pipeline ? makeTaskPipelineInfo(pipeline) : undefined;
  }

  getAllPipelineInfos(): TaskPipelineInfo[] {
    return this.getTaskPipelineExecutionArray().map((pipeline) => makeTaskPipelineInfo(pipeline));
  }

  getPipelineInfosInStage(stage: string): TaskPipelineInfo[] {
    return this.getTaskPipelineExecutionArray().reduce((acc, pipelineExecution) => {
      const currentStage = pipelineExecution.getCurrentStep()?.managedTask?.task?.taskType;
      if (stage === currentStage) {
        const taskPipelineInfo = makeTaskPipelineInfo(pipelineExecution);
        taskPipelineInfo && acc.push(taskPipelineInfo);
      }
      return acc;
    }, [] as TaskPipelineInfo[]);
  }

  getPipelineInfosByCurrentTaskType(): Record<string, TaskPipelineInfo[]> {
    return this.getAllPipelineInfos().reduce((acc, pipelineInfo) => {
      const currentTask = TaskPipelineUtils.getCurrentTask(pipelineInfo);
      const currentTaskType = currentTask?.taskType;
      if (currentTaskType) {
        acc[currentTaskType] = [...(acc[currentTaskType] || []), pipelineInfo];
      }
      return acc;
    }, {} as Record<string, TaskPipelineInfo[]>);
  }

  getPipelineInfosForContent(contentName: string): TaskPipelineInfo[] {
    return this.getPipelineExecsForContent(contentName).map((pipeline) => makeTaskPipelineInfo(pipeline));
  }

  hasPipelineForContent(contentName: string): boolean {
    return this.getPipelineExecsForContent(contentName).length > 0;
  }

  private getPipelineExecsForContent(
    contentName: string
  ): (SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution)[] {
    return this.getTaskPipelineExecutionArray().filter(
      (pipeline) => pipeline.context.dfContentInfo.name === contentName
    );
  }
}

export const makeTaskPipelineInfo = (
  taskPipelineExecution: SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution
): TaskPipelineInfo => {
  const { pipelineType, id, startTime, isCompleted } = taskPipelineExecution;
  const currentStep = taskPipelineExecution.getCurrentStep();
  const steps = taskPipelineExecution.getSteps();
  const taskManagerTasksMap = new Map<TaskManager, Task<any, any, any, any>[]>();

  steps.forEach(({ managedTask }) => {
    if (managedTask && managedTask.task) {
      const tasks = taskManagerTasksMap.get(managedTask.taskManager) || [];
      tasks.push(managedTask.task);
      taskManagerTasksMap.set(managedTask.taskManager, tasks);
    }
  });
  const positionInfoMap = new Map<string, PriorityPositionInfo | null>();
  for (const [taskManager, tasks] of taskManagerTasksMap.entries()) {
    taskManager.getTaskPositionInfoMap(tasks.map((task) => task.id)).forEach((positionInfo, taskId) => {
      positionInfoMap.set(taskId, positionInfo);
    });
  }

  return {
    pipelineDetails: {
      id,
      type: pipelineType,
      queuedTime: startTime,
      dfContent: taskPipelineExecution.context.dfContentInfo,
      mediaType: getMediaType(taskPipelineExecution.context.mediaInfo.mediaType)!,
      stepOrder: steps.map(({ step }) => step.id),
      steps: steps.reduce((acc, { step, managedTask }) => {
        acc[step.id] = {
          id: step.id,
          name: step.name,
        };
        return acc;
      }, {} as Record<string, StepDetails>),
    },
    pipelineStatus: {
      pipelineResult: taskPipelineExecution.pipelineResult?.status,
      statusMessage: taskPipelineExecution.generateStatusMessage(),
      isComplete: isCompleted,
      currentStep: currentStep.step.id,
    },
    stepTasks: steps.reduce((acc, { step, managedTask }) => {
      if (managedTask && managedTask.task) {
        acc[step.id] = makeTaskInfo(managedTask, positionInfoMap.get(managedTask.task.id) || null);
      }
      return acc;
    }, {} as Record<string, BasicTaskInfo | DownloadTaskInfo>),
  };
};

const makeTaskInfo = (
  managedTask: ManagedTask<any, any>,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo | DownloadTaskInfo => {
  if (isDownloadTask(managedTask.task)) {
    return makeDownloadSubtaskInfo(managedTask, positionInfo);
  } else {
    return makeBasicTaskInfo(managedTask, positionInfo);
  }
};

const makeCommonTaskInfo = (
  managedTask: GenericManagedTask,
  positionInfo: PriorityPositionInfo | null
): Omit<BasicTaskInfo, "capabilities"> => {
  const task = managedTask.task;
  const taskState = task.getTaskState();
  const taskResult = task.result;
  const taskError = taskResult?.status === "failed" ? taskResult.error : undefined;
  return {
    taskType: task.taskType,
    priority: positionInfo ? positionInfo.priority : -1,
    position: positionInfo ? positionInfo.position : -1,
    priorityPosition: positionInfo ? positionInfo.priorityPosition : -1,
    status:
      task && taskState
        ? {
            id: task.id,
            state: taskState,
            pauseTrigger: task.pauseTrigger || undefined,
            attempt: managedTask.attempt,
            message: task.getStatusMessage(),
            error: taskError ? makeErrorMessage(taskError) : undefined,
            forceStarted: task.forceRunFlag || undefined,
          }
        : null,
  };
};

const makeBasicTaskInfo = (
  managedTask: GenericManagedTask,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo => {
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    capabilities: [],
  };
};

const makeDownloadSubtaskInfo = (
  managedTask: ManagedTask<DownloadTask>,
  positionInfo: PriorityPositionInfo | null
): DownloadTaskInfo => {
  const task = managedTask.task;
  const downloadStatus = task?.getStatus();
  const commonTaskInfo = makeCommonTaskInfo(managedTask, positionInfo);
  const status: DownloadTaskStatus | null =
    task && commonTaskInfo.status
      ? {
          ...commonTaskInfo.status,
          currentProgress: downloadStatus ? makeDownloadProgressInfo(downloadStatus, managedTask.attempt) : undefined,
        }
      : null;
  return {
    ...commonTaskInfo,
    taskType: "download",
    capabilities: ["pause", "cancel"],
    status,
  };
};

const makeDownloadProgressInfo = (downloadStatus: DownloadContextStatus, attempt: number) => {
  return {
    startTime: downloadStatus.startTime,
    runningTime: downloadStatus.runningTime,
    totalBytesDownloaded: downloadStatus.bytesDownloaded,
    totalBytes: downloadStatus.bytesToDownload,
    retries: attempt - 1,
    percentComplete: downloadStatus.percentComplete,
    currentBytesPerSecond: downloadStatus.currentBytesPerSecond,
    averageBytesPerSecond: downloadStatus.averageBytesPerSecond,
  };
};
