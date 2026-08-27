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
  MediaFileMeta,
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
  TaskProgress,
  TaskStatus,
  isChangePositionAction,
  isChangePriorityAction,
  isControlPipelineRequest,
  isShiftAction,
  makeErrorMessage,
  MediaInfoUtils,
  sanitizeFilename
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
  PipelineStepInfo,
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
    // Genuinely light filesystem work (ffprobe a file, stat it) - cheap
    // enough that running several at once costs nothing.
    const fileTaskManager = new TaskManager({
      concurrentTasks: 5,
    });
    // Whole-file work: an ffmpeg remux to embed metadata, and moving a
    // finished download into place. Both read and write multi-gigabyte files
    // end to end, so they're bound by the disk rather than the CPU and
    // running several concurrently just makes them contend - noticeably so on
    // a NAS array. Serialized deliberately; these used to share
    // fileTaskManager's limit of 5.
    const mediaProcessingTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    const dfFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    const youtubeFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    const subtitlesTaskManager = new SubtitlesTaskManager({
      // See SubtitlesConfig.maxConcurrent - defaults to 1 because local
      // transcription is CPU-bound and each run already uses most of the
      // machine's cores.
      concurrentTasks: configService.config.subtitles?.maxConcurrent ?? 1,
    });
    this.subtitleTaskPipeline = createSubtitlesTaskPipeline({
      subtitlesTaskManager: subtitlesTaskManager,
      mediaProcessingTaskManager: mediaProcessingTaskManager,
    });
    this.downloadTaskPipeline = createDownloadTaskPipeline({
      downloadTaskManager: downloadTaskManager,
      subtitlesTaskManager: subtitlesTaskManager,
      fileTaskManager: fileTaskManager,
      mediaProcessingTaskManager: mediaProcessingTaskManager,
      youtubeFetchTaskManager: youtubeFetchTaskManager,
    });
    this.updateDownloadMetadataTaskPipeline = createUpdateDownloadMetadataTaskPipeline({
      fileTaskManager,
      mediaProcessingTaskManager,
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

  downloadContent(dfContentInfo: DfContentInfo, mediaInfo: MediaInfo, directUrl?: string) {
    let url: () => Promise<string>;
    let destination: string;
    let headers: Record<string, string>;

    if (directUrl) {
      // Only for genuinely-external manual downloads (the manual-download
      // flow, which passes an explicit non-DF URL) - no DF cookie/headers
      // needed since it's not digitalfoundry.net. Deliberately keyed off the
      // explicit `directUrl` param alone, not `|| mediaInfo.downloadUrl` -
      // the new site's listing populates mediaInfo.downloadUrl for every
      // DF-sourced item as a matter of course (see parseListingItem), so an
      // `||` fallback here silently routed every normal DF download through
      // this no-auth branch too, sending no autologin cookie at all and
      // landing on /login - confirmed live 2026-08-15 as the actual root
      // cause of every "download does nothing" report this session, not a
      // cookie/header/blacklist issue as originally suspected.
      const filename = mediaInfo.mediaFilename || sanitizeFilename(`${dfContentInfo.name}_${mediaInfo.formatString}.${MediaInfoUtils.getExtension(mediaInfo)}`);
      url = async () => directUrl;
      destination = `${configService.config.contentManagement.workDir}/${filename}`;
      headers = {
        "User-Agent": "DigitalFounload",
      };
    } else {
      // For DF downloads, use the existing logic
      const downloadParams = makeDfDownloadParams(dfContentInfo, mediaInfo);
      url = async () => {
        const resolvedUrl = await downloadParams.url();
        if (!resolvedUrl) {
          throw new Error(`Failed to resolve URL for ${dfContentInfo.name} with format ${mediaInfo.formatString}`);
        }
        return resolvedUrl;
      };
      destination = downloadParams.destination;
      headers = downloadParams.headers;
    }

    const downloadExecution = this.downloadTaskPipeline.start({
      dfContentInfo,
      mediaInfo,
      url,
      downloadLocation: destination,
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
    language: LanguageCode | string,
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

  updateDownloadMetadata(dfContentInfo: DfContentInfo, fileLocation: string, mediaFileMeta?: MediaFileMeta) {
    const updateDownloadMetadataExecution = this.updateDownloadMetadataTaskPipeline.start({
      dfContentInfo,
      fileLocation,
      mediaFileMeta,
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
      (pipeline) => pipeline.context.dfContentInfo.key === contentName
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
  let taskFound = false;
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
    startTime: task.startTime || undefined,
    endTime: task.endTime || undefined,
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
  // Tasks opt into progress reporting by returning it from getStatus() - see
  // TaskProgress. Most don't, in which case this is simply absent.
  const statusDetail = task.getStatus() as { progress?: TaskProgress } | undefined;
  return {
    state: taskState,
    pauseTrigger: task.pauseTrigger || undefined,
    isComplete: task.isCompleted(),
    attempt: managedTask.attempt,
    message: task.getStatusMessage(),
    error: taskError ? makeErrorMessage(taskError) : undefined,
    forceStarted: task.forceRunFlag || undefined,
    progress: statusDetail?.progress,
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
