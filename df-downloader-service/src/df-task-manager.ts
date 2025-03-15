import {
  BasicTaskInfo,
  ClearMissingFilesTaskInfo,
  ContentMoveFileInfo,
  ControlPipelineRequest,
  ControlRequest,
  ControlTaskRequest,
  DfContentInfo,
  DownloadTaskInfo,
  DownloadTaskStatus,
  LanguageCode,
  MediaInfo,
  MoveFilesTaskInfo,
  MoveFilesTaskResult,
  REMOVE_EMPTY_DIRS_TASK_TYPE,
  RemoveEmptyDirsTaskInfo,
  SCAN_FOR_EXISTING_CONTENT_TASK_TYPE,
  ScanForExistingContentTaskInfo,
  StepDetails,
  TaskAction,
  TaskInfo,
  TaskPipelineInfo,
  TaskPipelineUtils,
  TaskStatus,
  isChangePositionAction,
  isChangePriorityAction,
  isControlPipelineRequest,
  isShiftAction,
  makeErrorMessage
} from "df-downloader-common";
import { configService } from "./config/config.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
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
import { BatchMoveFilesTask, isBatchMoveFilesTask, makeMoveFilesTaskStatus } from "./tasks/batch-move-files-task.js";
import { ClearMissingFilesTask, isClearMissingFilesTask } from "./tasks/clear-missing-files-task.js";
import { DownloadTask, DownloadTaskManager, isDownloadTask } from "./tasks/download-task.js";
import { RemoveEmptyDirsTask, isRemoveEmptyDirsTask } from "./tasks/remove-empty-dirs-task.js";
import { ScanForExistingContentTask, isScanForExistingContentTask } from "./tasks/scan-for-content-task.js";
import { SubtitlesTaskManager } from "./tasks/subtitles-task.js";
import { createUpdateDownloadMetadataTaskPipeline, UpdateDownloadMetadataTaskPipeline, UpdateDownloadMetadataTaskPipelineExecution } from "./task-pipelines/update-download-metadata-task-pipeline.js";

type DfTaskManagerOpts = {
  autoClearCompletedPipelines?: boolean;
};

type PipelineExecutionTypes = SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution | UpdateDownloadMetadataTaskPipelineExecution;
/**
 * This class is responsible for managing the task pipelines for downloading and generating subtitles (and any
 * other task pipelines that may be added in the future).
 */
export class DfTaskManager {
  readonly subtitleTaskPipeline: SubtitlesTaskPipeline;
  readonly downloadTaskPipeline: DownloadTaskPipeline;
  readonly updateDownloadMetadataTaskPipeline: UpdateDownloadMetadataTaskPipeline;

  readonly maintenanceOperationsTaskManager: TaskManager;

  readonly pipelineExecutions = new Map<string, PipelineExecutionTypes>();
  readonly tasks = new Map<string, ManagedTask<any, any>>();

  autoClearCompletedPipelines: boolean;

  constructor({ autoClearCompletedPipelines = false }: DfTaskManagerOpts = {}) {
    this.autoClearCompletedPipelines = autoClearCompletedPipelines;
    const downloadConfig = configService.config.downloads;

    const downloadTaskManager = new DownloadTaskManager({
      concurrentTasks: downloadConfig.maxSimultaneousDownloads,
      retries: {
        maxRetries: downloadConfig.maxRetries,
        retryDelay: downloadConfig.failureRetryIntervalBase,
        retryDelayMultiplier: 2,
      },
    });
    const fileTaskManager = new TaskManager({
      concurrentTasks: 5,
    });
    const dfFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    const youtubeFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    const subtitlesTaskManager = new SubtitlesTaskManager({
      concurrentTasks: 5,
    });
    this.subtitleTaskPipeline = createSubtitlesTaskPipeline({
      subtitlesTaskManager: subtitlesTaskManager,
      fileTaskManager: fileTaskManager,
    });
    this.downloadTaskPipeline = createDownloadTaskPipeline({
      downloadTaskManager: downloadTaskManager,
      subtitlesTaskManager: subtitlesTaskManager,
      fileTaskManager: fileTaskManager,
    });
    this.updateDownloadMetadataTaskPipeline = createUpdateDownloadMetadataTaskPipeline({
      fileTaskManager,
      dfFetchTaskManager,
      youtubeFetchTaskManager,
    });
    this.maintenanceOperationsTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
  }

  private addTaskPipelineExecution(pipelineExecution: PipelineExecutionTypes) {
    this.pipelineExecutions.set(pipelineExecution.id, pipelineExecution);
    pipelineExecution.once("completed", () => {
      if (this.autoClearCompletedPipelines) {
        this.clearCompletedPipelineExec(pipelineExecution.id);
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
        const finalLocation = result.pipelineResult.downloadLocation;
        notifier.downloadComplete(
          dfContentInfo,
          mediaInfo,
          finalLocation,
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

  updateDownloadMetadata(dfContentInfo: DfContentInfo, fileLocation: string) {
    const updateDownloadMetadataExecution = this.updateDownloadMetadataTaskPipeline.start({
      dfContentInfo,
      fileLocation,
    });
    this.addTaskPipelineExecution(updateDownloadMetadataExecution);
    return updateDownloadMetadataExecution;
  }

  batchMoveFiles(toMove: ContentMoveFileInfo[], overwrite: boolean, removeRecordIfMissing: boolean) {
    const fileMoveTask = this.maintenanceOperationsTaskManager.addTask(BatchMoveFilesTask(toMove, {
      overwrite: overwrite,
      removeRecordIfMissing: removeRecordIfMissing,
      db: serviceLocator.db,
    }, {
      maxConcurrent: 10,
    }));
    this.tasks.set(fileMoveTask.task.id, fileMoveTask);
    return fileMoveTask;
  }

  clearMissingFiles() {
    const removeMissingFilesTask = this.maintenanceOperationsTaskManager.addTask(ClearMissingFilesTask());
    this.tasks.set(removeMissingFilesTask.task.id, removeMissingFilesTask);
    return removeMissingFilesTask;
  }

  scanForExistingContent(contentManager: DigitalFoundryContentManager) {
    const scanForExistingContentTask = this.maintenanceOperationsTaskManager.addTask(ScanForExistingContentTask(contentManager));
    this.tasks.set(scanForExistingContentTask.task.id, scanForExistingContentTask);
    return scanForExistingContentTask;
  }

  removeEmptyDirs(dir: string) {
    const removeEmptyDirsTask = this.maintenanceOperationsTaskManager.addTask(RemoveEmptyDirsTask(dir));
    this.tasks.set(removeEmptyDirsTask.task.id, removeEmptyDirsTask);
    return removeEmptyDirsTask;
  }

  clearCompletedPipelineExecs() {
    this.pipelineExecutions.forEach((execution, name) => {
      if (execution.isCompleted) {
        this.pipelineExecutions.delete(name);
      }
    });
  }

  clearCompletedPipelineExec(id: string) {
    const execution = this.pipelineExecutions.get(id);
    if (execution && execution.isCompleted) {
      this.pipelineExecutions.delete(id);
    }
  }

  clearCompletedTasks() {
    this.tasks.forEach((task, name) => {
      if (task.isCompleted()) {
        this.tasks.delete(name);
      }
    });
  }

  clearCompletedTask(id: string) {
    const task = this.tasks.get(id);
    if (task && task.isCompleted()) {
      this.tasks.delete(id);
    }
  }

  private controlTaskManagerTask(managedTask: GenericManagedTask, action: TaskAction) {
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
      this.clearCompletedPipelineExec(pipelineExecutionId);
      return;
    }
    const step = stepId ? pipeline.getStepById(stepId) : pipeline.getCurrentStep();
    const managedTask = step?.managedTask as GenericManagedTask | undefined;
    if (!managedTask?.task) {
      throw new Error(`No curent task for taskInfo ${pipelineExecutionId}`);
    }
    this.controlTaskManagerTask(managedTask, action);
  }

  controlTask(controlTaskRequest: ControlTaskRequest) {
    if (controlTaskRequest.action === "clear") {
      this.clearCompletedTask(controlTaskRequest.taskId);
      return;
    }
    const task = this.tasks.get(controlTaskRequest.taskId);
    if (!task) {
      throw new Error(`No task with id ${controlTaskRequest.taskId}`);
    }
    this.controlTaskManagerTask(task, controlTaskRequest.action);
  }

  control(controlRequest: ControlRequest) {
    if (isControlPipelineRequest(controlRequest)) {
      this.controlPipeline(controlRequest);
    } else {
      this.controlTask(controlRequest);
    }
  }

  private getTaskPipelineExecutionArray() {
    return Array.from(this.pipelineExecutions.values());
  }

  getPipelineInfo(id: string): TaskPipelineInfo | undefined {
    const pipeline = this.pipelineExecutions.get(id);
    return pipeline ? makeTaskPipelineInfo(pipeline) : undefined;
  }

  getTaskInfo(id: string): TaskInfo | undefined {
    const task = this.tasks.get(id);
    return task ? makeTaskInfo(task, null) : undefined;
  }

  getAllPipelineInfos(): TaskPipelineInfo[] {
    return this.getTaskPipelineExecutionArray().map((pipeline) => makeTaskPipelineInfo(pipeline));
  }

  getAllTaskInfos(): TaskInfo[] {
    return Array.from(this.tasks.values()).map((managedTask) => makeTaskInfo(managedTask, null));
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
  ): (PipelineExecutionTypes)[] {
    return this.getTaskPipelineExecutionArray().filter(
      (pipeline) => pipeline.context.dfContentInfo.name === contentName
    );
  }
}

export const makeTaskPipelineInfo = (
  taskPipelineExecution: PipelineExecutionTypes
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
  const mediaInfo = 'mediaInfo' in taskPipelineExecution.context ? taskPipelineExecution.context.mediaInfo : null;
  return {
    id,
    type: "pipeline",
    pipelineType,
    pipelineDetails: {
      id,
      type: pipelineType,
      queuedTime: startTime,
      dfContent: taskPipelineExecution.context.dfContentInfo,
      mediaFormat: mediaInfo?.formatString || "",
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

//TODO: All of these task infos are getting quite over the top, I should refactor this

const makeTaskInfo = (
  managedTask: ManagedTask<any, any>,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo | DownloadTaskInfo => {
  if (isDownloadTask(managedTask.task)) {
    return makeDownloadSubtaskInfo(managedTask, positionInfo);
  } else if (isBatchMoveFilesTask(managedTask.task)) {
    return makeMoveFilesTaskInfo(managedTask, positionInfo);
  } else if (isClearMissingFilesTask(managedTask.task)) {
    return makeClearMissingFilesTaskInfo(managedTask, positionInfo);
  } else if (isScanForExistingContentTask(managedTask.task)) {
    return makeScanForExistingContentTaskInfo(managedTask, positionInfo);
  } else if (isRemoveEmptyDirsTask(managedTask.task)) {
    return makeRemoveEmptyDirsTaskInfo(managedTask, positionInfo);
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
    id: task.id,
    type: "task",
    taskType: task.taskType,
    priority: positionInfo ? positionInfo.priority : -1,
    position: positionInfo ? positionInfo.position : -1,
    priorityPosition: positionInfo ? positionInfo.priorityPosition : -1,
    status:
      task && taskState
        ? makeCommonTaskStatusInfo(managedTask)
        : null,
  };
};

const makeCommonTaskStatusInfo = (managedTask: GenericManagedTask): TaskStatus => {
  const task = managedTask.task;
  const taskState = task.getTaskState();
  const taskResult = task.result;
  const taskError = taskResult?.status === "failed" ? taskResult.error : undefined;
  return {
    state: taskState,
    pauseTrigger: task.pauseTrigger || undefined,
    isComplete: task.isCompleted(),
    attempt: managedTask.attempt,
    message: task.getStatusMessage(),
    error: taskError ? makeErrorMessage(taskError) : undefined,
    forceStarted: task.forceRunFlag || undefined,
  };
}

const makeBasicTaskInfo = (
  managedTask: GenericManagedTask,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo => {
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    capabilities: [],
  };
};

const makeMoveFilesTaskInfo = (
  managedTask: ManagedTask<BatchMoveFilesTask>,
  positionInfo: PriorityPositionInfo | null
): MoveFilesTaskInfo => {
  const task = managedTask.task;
  const taskState = task.getTaskState();
  const taskResult = task.result;
  let resultData: MoveFilesTaskResult | null = null;
  const progressStatus = makeMoveFilesTaskStatus(task);
  if (taskResult?.status) {
    const taskErrors = taskResult.status === 'failed' ? [taskResult.error] : taskResult.status === 'success' ? taskResult.result.errors || [] : [];
    resultData = {
      moved: progressStatus.moved,
      failed: progressStatus.failed,
      recordRemoved: progressStatus.recordRemoved,
      total: progressStatus.total,
      errors: taskErrors.map(makeErrorMessage),
    }
  }
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    taskType: "batch_move_files",
    capabilities: ["pause", "cancel"],
    status:
      task && taskState
        ? {
          ...makeCommonTaskStatusInfo(managedTask),
          currentProgress: progressStatus,
        }
        : null,
    result: resultData,
  };
}

const makeClearMissingFilesTaskInfo = (
  managedTask: ManagedTask<ClearMissingFilesTask>,
  positionInfo: PriorityPositionInfo | null
): ClearMissingFilesTaskInfo => {
  const task = managedTask.task;
  const taskState = task.getTaskState();
  const taskResult = task.result;
  const taskStatus = task.getStatus();
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    taskType: "clear_missing_files",
    capabilities: [],
    status:
      task && taskState
        ? {
          ...makeCommonTaskStatusInfo(managedTask),
          ...taskStatus,
        }
        : null,
    result: taskResult?.status === "success" ? taskResult.result : null,
  };
}

const makeScanForExistingContentTaskInfo = (
  managedTask: ManagedTask<ScanForExistingContentTask>,
  positionInfo: PriorityPositionInfo | null
): ScanForExistingContentTaskInfo => {
  const task = managedTask.task;
  const taskState = task.getTaskState();
  const taskResult = task.result;
  const taskStatus = task.getStatus();
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    taskType: SCAN_FOR_EXISTING_CONTENT_TASK_TYPE,
    capabilities: [],
    status:
      task && taskState
        ? {
          ...makeCommonTaskStatusInfo(managedTask),
        }
        : null,
    result: taskResult?.status === "success" ? {
      foundFiles: taskResult.result.foundFiles.map((file) => file.downloadInfo.downloadLocation),
    } : null,
  }
}

const makeRemoveEmptyDirsTaskInfo = (
  managedTask: ManagedTask<RemoveEmptyDirsTask>,
  positionInfo: PriorityPositionInfo | null
): RemoveEmptyDirsTaskInfo => {
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    taskType: REMOVE_EMPTY_DIRS_TASK_TYPE,
    capabilities: [],
    status: makeCommonTaskStatusInfo(managedTask),
    result: managedTask.task.result?.status === "success" ? {
      removedDirs: managedTask.task.result.result,
    } : null,
  };
}

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
