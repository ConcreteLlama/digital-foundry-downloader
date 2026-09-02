import {
  getDownloadStepNotApplicableReasons,
  BasicTaskInfo,
  ClearMissingFilesTaskInfo,
  ContentMoveFileInfo,
  ControlPipelineRequest,
  ControlRequest,
  ControlTaskRequest,
  BulkBackfillTarget,
  DfContentEntry,
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
  BulkBackfillTaskInfo,
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
  logger,
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
import { CompletedPipeline, PersistedPipeline, PersistedStepResult, summariseForArchive } from "./db/pipeline-db-model.js";
import { PriorityPositionInfo } from "./task-manager/priority-item-manager.js";
import { TypedEventEmitter } from "./utils/event-emitter.js";
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
import {
  AiAnalysisTaskPipeline,
  AiAnalysisTaskPipelineExecution,
  createAiAnalysisTaskPipeline,
} from "./task-pipelines/ai-analysis-task-pipeline.js";
import { AiAnalysisTaskManager } from "./tasks/ai-analysis-task.js";
import { BULK_BACKFILL_CONCURRENCY, BulkBackfillTask, isBulkBackfillTask } from "./tasks/bulk-backfill-task.js";
import { ensureArticleForContent } from "./utils/df-articles/ensure-article.js";
import { AiAnalysisConfig, AiAnalysisConfigUtils, AiProviderId } from "df-downloader-common/config/ai-analysis-config.js";
import { AiAnalysisSourceSelection, MetadataBackfillOptions, metadataFingerprintOf } from "df-downloader-common";
import { buildMetadataForBackfill } from "./utils/metadata-backfill.js";
import { InjectMetadataTask } from "./tasks/inject-metadata-task.js";
import { Chapter } from "./utils/chatpers.js";
import { DfDownloaderOperationalDb } from "./db/df-operational-db.js";
import { BatchMoveFilesTask, isBatchMoveFilesTask, makeMoveFilesTaskStatus } from "./tasks/batch-move-files-task.js";
import { ClearMissingFilesTask, isClearMissingFilesTask } from "./tasks/clear-missing-files-task.js";
import { DownloadTask, DownloadTaskManager, isDownloadTask } from "./tasks/download-task.js";
import { RemoveEmptyDirsTask, isRemoveEmptyDirsTask } from "./tasks/remove-empty-dirs-task.js";
import { ScanForExistingContentTask, isScanForExistingContentTask } from "./tasks/scan-for-content-task.js";
import { isSubtitlesTask, SubtitlesTaskManager } from "./tasks/subtitles-task.js";
import { createUpdateDownloadMetadataTaskPipeline, UpdateDownloadMetadataTaskPipeline, UpdateDownloadMetadataTaskPipelineExecution } from "./task-pipelines/update-download-metadata-task-pipeline.js";

type DfTaskManagerOpts = {
  autoClearCompletedPipelines?: boolean;
};

type PipelineExecutionTypes = SubtitlesTaskPipelineExecution | DownloadTaskPipelineExecution | UpdateDownloadMetadataTaskPipelineExecution | AiAnalysisTaskPipelineExecution;
/**
 * This class is responsible for managing the task pipelines for downloading and generating subtitles (and any
 * other task pipelines that may be added in the future).
 */
/**
 * Queue priority for work a bulk run queued. Lower is sooner, and the task
 * managers default to 1, so this sits behind everything queued normally.
 */
const BACKGROUND_TASK_PRIORITY = 2;

export class DfTaskManager {
  readonly subtitleTaskPipeline: SubtitlesTaskPipeline;
  readonly aiAnalysisTaskPipeline: AiAnalysisTaskPipeline;
  readonly downloadTaskPipeline: DownloadTaskPipeline;
  readonly updateDownloadMetadataTaskPipeline: UpdateDownloadMetadataTaskPipeline;

  readonly maintenanceOperationsTaskManager: TaskManager;
  /** Held so a metadata backfill can queue a whole-file rewrite onto the same serialised queue. */
  private readonly mediaProcessingTaskManager: TaskManager;
  /**
   * Held so a metadata backfill can queue a *tag-only* rewrite here instead.
   * A tag edit is ~1 MiB of I/O whatever the file's size, so it does not
   * belong in the one-at-a-time queue that exists for whole-file work.
   */
  private readonly fileTaskManager: TaskManager;
  /**
   * Where bulk backfill runs live, deliberately NOT the maintenance
   * manager.
   *
   * A bulk run is unlike every other long task here: it does not do the
   * work itself, it drives the ordinary per-item pipelines and waits for
   * them. The AI analysis pipeline finishes by saving through the
   * maintenance manager, which allows one task at a time - so a bulk run
   * queued there took the only slot, awaited a pipeline, and that
   * pipeline's save step queued behind the run that was waiting on it.
   * The whole thing stopped dead at "save analysis" until someone
   * advanced it by hand.
   *
   * Anything that waits on other tasks needs a slot those tasks are not
   * competing for, so this is its own manager rather than a larger
   * concurrency number on the shared one - which would only raise the
   * item count needed to deadlock.
   */
  readonly bulkOperationsTaskManagers: Record<BulkBackfillTarget, TaskManager>;

  readonly pipelineExecutions = new Map<string, PipelineExecutionTypes>();
  /**
   * Every queue, so "pause everything" can hold all of them.
   *
   * The work is spread across a manager per concern - downloads, subtitles,
   * media processing, one per backfill target - and holding only some of them
   * would stop some of the queue, which is worse than stopping none.
   */
  private readonly allTaskManagers: TaskManager[] = [];
  readonly tasks = new Map<string, ManagedTask<any, any>>();

  /**
   * Fires whenever something happened that would change what the tasks
   * endpoint returns. Exists so a push transport (the SSE stream) can
   * subscribe in one place, rather than tracking every live pipeline and task
   * individually and re-subscribing as they come and go.
   *
   * Deliberately a plain TypedEventEmitter, not the CachedEventEmitter that
   * pipelines and tasks themselves extend: that one replays its whole event
   * cache to every new `.on()` listener, so a client connecting midway through
   * a download would be handed a burst of historical events on subscribe.
   *
   * This covers state *transitions* only. Download byte progress is pull-only
   * (Download.getStatus() reads the context on demand; the FSM emits
   * stateChanged solely on genuine state changes), so nothing fires as bytes
   * arrive - a subscriber that wants a moving progress bar has to sample while
   * work is in flight. See hasActiveWork().
   */
  readonly events = new TypedEventEmitter<{ changed: undefined }>();

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
    this.allTaskManagers.push(downloadTaskManager);
    // Genuinely light filesystem work (ffprobe a file, stat it) - cheap
    // enough that running several at once costs nothing.
    const fileTaskManager = new TaskManager({
      concurrentTasks: 5,
    });
    this.allTaskManagers.push(fileTaskManager);
    this.fileTaskManager = fileTaskManager;
    // Whole-file work: an ffmpeg remux to embed metadata, and moving a
    // finished download into place. Both read and write multi-gigabyte files
    // end to end, so they're bound by the disk rather than the CPU and
    // running several concurrently just makes them contend - noticeably so on
    // a NAS array. Serialized deliberately; these used to share
    // fileTaskManager's limit of 5.
    const mediaProcessingTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    this.allTaskManagers.push(mediaProcessingTaskManager);
    this.mediaProcessingTaskManager = mediaProcessingTaskManager;
    const dfFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    this.allTaskManagers.push(dfFetchTaskManager);
    const youtubeFetchTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    this.allTaskManagers.push(youtubeFetchTaskManager);
    const subtitlesTaskManager = new SubtitlesTaskManager({
      // See SubtitlesConfig.maxConcurrent - defaults to 1 because local
      // transcription is CPU-bound and each run already uses most of the
      // machine's cores.
      concurrentTasks: configService.config.subtitles?.maxConcurrent ?? 1,
    });
    this.allTaskManagers.push(subtitlesTaskManager);
    this.subtitleTaskPipeline = createSubtitlesTaskPipeline({
      subtitlesTaskManager: subtitlesTaskManager,
      mediaProcessingTaskManager: mediaProcessingTaskManager,
    });
    // One manager shared by both pipelines, so the concurrency cap covers
    // every analysis in flight rather than being applied twice over.
    const aiAnalysisTaskManager = new AiAnalysisTaskManager();
    this.allTaskManagers.push(aiAnalysisTaskManager);
    this.downloadTaskPipeline = createDownloadTaskPipeline({
      downloadTaskManager: downloadTaskManager,
      subtitlesTaskManager: subtitlesTaskManager,
      fileTaskManager: fileTaskManager,
      mediaProcessingTaskManager: mediaProcessingTaskManager,
      youtubeFetchTaskManager: youtubeFetchTaskManager,
      aiAnalysisTaskManager,
    });
    this.updateDownloadMetadataTaskPipeline = createUpdateDownloadMetadataTaskPipeline({
      fileTaskManager,
      mediaProcessingTaskManager,
      dfFetchTaskManager,
      youtubeFetchTaskManager,
    });
    // Registered below with the rest, once constructed.
    this.maintenanceOperationsTaskManager = new TaskManager({
      concurrentTasks: 1,
    });
    this.allTaskManagers.push(this.maintenanceOperationsTaskManager);
    /*
      One slot per kind of bulk run, rather than one slot for all of them.

      A single shared slot was justified on the grounds that two bulk runs
      would fight over the same request queue and CPU - but that is precisely
      what these do not share. Matching articles is bound by the Digital
      Foundry request queue and spends nearly all its time waiting on it;
      generating subtitles is local Whisper and is bound by CPU; analysing is
      bound by the Anthropic API. Three different resources, so a
      whole-library article run - hours of deliberately spaced requests - was
      blocking a transcription run that needed none of what it was holding.

      Keeping each target to one run at a time still prevents the contention
      the single slot was really protecting against: two Whisper runs
      competing for cores, or two article runs queueing against each other.
      Access to Digital Foundry is paced centrally by the request queue in
      any case (see df-request-queue.ts), so that resource was never the one
      this slot was protecting.
    */
    this.bulkOperationsTaskManagers = BulkBackfillTarget.options.reduce((managers, target) => {
      managers[target] = new TaskManager({ concurrentTasks: 1 });
      this.allTaskManagers.push(managers[target]);
      return managers;
    }, {} as Record<BulkBackfillTarget, TaskManager>);
    this.aiAnalysisTaskPipeline = createAiAnalysisTaskPipeline({
      aiAnalysisTaskManager,
      storageTaskManager: this.maintenanceOperationsTaskManager,
      db: serviceLocator.db,
    });
  }

  private notifyChanged() {
    this.events.emit("changed", undefined);
  }

  /**
   * True if anything is still in flight. Used to decide whether a subscriber
   * needs to keep sampling for progress that no event will announce - see the
   * `events` doc comment.
   */
  hasActiveWork() {
    for (const pipelineExecution of this.pipelineExecutions.values()) {
      if (!pipelineExecution.isCompleted) {
        return true;
      }
    }
    for (const task of this.tasks.values()) {
      if (!task.isCompleted()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Registers a standalone (non-pipeline) task and wires it into the aggregate
   * change signal.
   */
  private trackTask<MANAGED_TASK extends ManagedTask<any, any>>(managedTask: MANAGED_TASK): MANAGED_TASK {
    this.tasks.set(managedTask.task.id, managedTask);
    managedTask.task.on("taskStateChanged", () => this.notifyChanged());
    this.notifyChanged();
    return managedTask;
  }

  private addTaskPipelineExecution(pipelineExecution: PipelineExecutionTypes) {
    this.pipelineExecutions.set(pipelineExecution.id, pipelineExecution);
    // Step boundaries and each step task's own coarse state transitions are
    // what actually move a pipeline through its lifecycle, so they're the
    // events worth pushing promptly.
    pipelineExecution.on("stepTaskStarted", ({ task }) => {
      task?.task?.on("taskStateChanged", () => this.notifyChanged());
      this.notifyChanged();
    });
    pipelineExecution.on("stepCompleted", () => this.notifyChanged());
    pipelineExecution.on("completed", () => this.notifyChanged());
    this.notifyChanged();
    // Every pipeline is registered here, so this is the one place persistence
    // needs to hook into - it covers all pipeline types without the generic
    // pipeline machinery needing to know anything about storage.
    const persist = () => {
      const activeDb = serviceLocator.activePipelineDb;
      if (!activeDb) {
        return;
      }
      activeDb
        .upsert(makePersistedPipeline(pipelineExecution))
        .catch((e) => logger.log("error", `Failed to record pipeline ${pipelineExecution.id}`, e));
    };
    persist();
    // Recorded per step rather than continuously: a step boundary is exactly
    // the point a restart could usefully resume from, and writing more often
    // would rewrite the file for progress that can't be resumed into anyway.
    //
    // Both edges, not just completion. Recording only on completion leaves it
    // ambiguous how far a pipeline had actually got when it died mid-step -
    // the difference between re-running the step that was interrupted and
    // re-running the one before it too. For a download followed by an hour of
    // transcription, that difference is the whole point.
    pipelineExecution.on("stepTaskStarted", persist);
    pipelineExecution.on("stepCompleted", persist);
    pipelineExecution.once("completed", (result: any) => {
      const activeDb = serviceLocator.activePipelineDb;
      const completedDb = serviceLocator.completedPipelineDb;
      if (activeDb && completedDb) {
        const persisted = makePersistedPipeline(pipelineExecution);
        completedDb
          .add({
            ...persisted,
            // Summarised only here. The active record keeps everything, since
            // that is the copy a resume replays.
            stepResults: summariseForArchive(persisted.stepResults),
            completedAt: new Date(),
            result: result?.status || "failed",
          })
          // Removed from the active set only once it's safely archived, so a
          // crash between the two leaves it looking in-flight (and resumable)
          // rather than vanishing entirely.
          .then(() => activeDb.remove(pipelineExecution.id))
          .catch((e) => logger.log("error", `Failed to archive pipeline ${pipelineExecution.id}`, e));
      }
      if (this.autoClearCompletedPipelines) {
        this.forgetCompletedPipelineExec(pipelineExecution.id);
      }
    });
  }

  downloadContent(
    dfContentInfo: DfContentInfo,
    mediaInfo: MediaInfo,
    directUrl?: string,
    resumeFrom?: { stepIndex: number; results: any[]; downloadLocation?: string; resumeAttempts?: number }
  ) {
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
      const filename = sanitizeFilename(
        mediaInfo.mediaFilename ||
          `${dfContentInfo.name}_${mediaInfo.formatString}.${MediaInfoUtils.getExtension(mediaInfo)}`
      );
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

    const downloadExecution = this.downloadTaskPipeline.start(
      {
        dfContentInfo,
        mediaInfo,
        url,
        // A resumed pipeline must operate on the file the previous run
        // actually produced, not a freshly-derived path.
        downloadLocation: resumeFrom?.downloadLocation || destination,
        headers,
        resumeAttempts: resumeFrom?.resumeAttempts,
      },
      resumeFrom ? { resumeFrom: { stepIndex: resumeFrom.stepIndex, results: resumeFrom.results } } : {}
    );
    logger.log(
      "info",
      `Queued download: "${dfContentInfo.title}" [${mediaInfo.formatString}]${
        resumeFrom ? ` (resuming from step ${resumeFrom.stepIndex})` : ""
      } -> ${destination}`
    );
    serviceLocator.notifier.downloadQueued(dfContentInfo);
    downloadExecution.once("stepTaskStarted", () => {
      logger.log("info", `Download started: "${dfContentInfo.title}" [${mediaInfo.formatString}]`);
      serviceLocator.notifier.downloadStarting(dfContentInfo, mediaInfo);
    });
    downloadExecution.once("completed", (result) => {
      const notifier = serviceLocator.notifier;
      if (isPipelineExecutionFailedResult(result)) {
        logger.log("error", `Download failed: "${dfContentInfo.title}"`, result.error);
        notifier.downloadFailed(dfContentInfo, result.error);
        return;
      } else if (isPipelineExecutionSuccessResult(result)) {
        logger.log(
          "info",
          `Download complete: "${dfContentInfo.title}" -> ${result.pipelineResult.downloadLocation}`
        );
        const finalLocation = result.pipelineResult.downloadLocation;
        notifier.downloadComplete(
          dfContentInfo,
          mediaInfo,
          finalLocation,
          makeDownloadProgressInfo(result.pipelineResult.finalDownloadStatus!, result.pipelineResult.attempts || 1)
        );
        // The file exists at its final path now, so anything watching the
        // library can be told. Batched with the metadata and subtitle writes
        // that follow it - see MediaServerManager.
        serviceLocator.mediaServers.fileChanged(finalLocation, "download");
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
    subtitleGenerators: SubtitleGenerator | SubtitleGenerator[],
    /** Set when a bulk run queued this - see TaskPipelineDetails.backfillJobId. */
    backfillJobId?: string
  ) {
    const subtitleExecution = this.subtitleTaskPipeline.start(
      {
        dfContentInfo,
        mediaInfo,
        fileLocation,
        language,
        subtitleGenerators,
        backfillJobId,
      },
      /*
       * A bulk run waits; anything else jumps it.
       *
       * `subtitlesTaskManager` runs one transcription at a time, and a
       * backfill can fill it with hundreds. Before this, a download that
       * completed during a backfill sat behind the whole queue - the file was
       * there, but its subtitles, metadata and analysis were hours away.
       *
       * Only bulk work is demoted, rather than downloads being promoted, so a
       * subtitle run started by hand from the content page also beats the
       * backfill. Both are someone waiting on one specific video.
       */
      { priority: backfillJobId ? BACKGROUND_TASK_PRIORITY : undefined }
    );
    const generatorNames = (Array.isArray(subtitleGenerators) ? subtitleGenerators : [subtitleGenerators])
      .map((generator) => generator.serviceType)
      .join(", ");
    logger.log(
      "info",
      `Queued subtitle generation: "${dfContentInfo.title}" [${language}] using ${generatorNames || "no services"}`
    );
    this.addTaskPipelineExecution(subtitleExecution);
    return subtitleExecution;
  }

  /**
   * Queues an analysis run for one content entry.
   *
   * Takes a resolved config rather than reading it here so a caller can
   * run with settings that differ from the saved ones - which is what the
   * "analyse with a different model" path in the UI needs.
   */
  analyseContent(entry: DfContentEntry, config: AiAnalysisConfig, opts: { chapters?: Chapter[]; articleText?: string; articleUrl?: string; articleTitle?: string; backfillJobId?: string; force?: boolean; sources?: AiAnalysisSourceSelection; provider?: AiProviderId } = {}) {
    const analysisExecution = this.aiAnalysisTaskPipeline.start({
      dfContentInfo: entry.contentInfo,
      entry,
      config,
      chapters: opts.chapters,
      articleText: opts.articleText,
      articleUrl: opts.articleUrl,
      articleTitle: opts.articleTitle,
      backfillJobId: opts.backfillJobId,
      force: opts.force,
      sources: opts.sources,
      provider: opts.provider,
      // A bulk run always carries a job id, so this is exactly "one item a
      // person asked for". Only those may spend a YouTube request looking for
      // chapters the file did not have - see resolveChapters.
      allowRemoteChapters: !opts.backfillJobId,
    });
    logger.log(
      "info",
      // The engine that will actually answer, not the configured hosted one -
      // logging the latter for a local run names something that never ran.
      `Queued AI analysis: "${entry.contentInfo.title}" using ${AiAnalysisConfigUtils.resolveModelName(
        config,
        opts.provider
      )}${
        opts.articleText ? " (with DF article as grounding)" : " (no article found)"
      }`
    );
    this.addTaskPipelineExecution(analysisExecution);
    return analysisExecution;
  }

  /**
   * Resolves once a pipeline finishes, so a bulk run can wait on the same
   * pipelines the single-item actions use rather than reimplementing their
   * work.
   *
   * Safe to attach after the pipeline may already have finished: these
   * executions replay their event cache to new listeners, so a fast
   * pipeline cannot complete into a gap before the handler is registered.
   */
  private awaitPipeline(execution: { on: (event: "completed", cb: (result: any) => void) => void }, what: string) {
    return new Promise<any>((resolve, reject) => {
      execution.on("completed", (result) => {
        if (result?.status === "success") {
          resolve(result);
        } else {
          reject(new Error(`${what} failed: ${result?.error ? makeErrorMessage(result.error) : result?.status ?? "unknown"}`));
        }
      });
    });
  }

  /**
   * Generates subtitles for one item as part of a bulk run.
   *
   * Mirrors the single-item REST path deliberately, including recording
   * the result against the download afterwards - without that the file
   * gains subtitles but nothing in the library knows, so the next bulk run
   * would generate them all over again.
   */
  /**
   * Public because resuming after a restart needs exactly this - queue the
   * work and record the result - and a second copy of it in the resume path
   * would be a second place for the two to drift apart.
   */
  async runSubtitlesForContent(contentKey: string, language: string, backfillJobId?: string, downloadLocation?: string) {
    const db = serviceLocator.db;
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      throw new Error(`Content ${contentKey} not found`);
    }
    // The specific file when one was named - a resumed run should carry on
    // with the download it was queued against, not whichever video comes
    // first on an entry that has several.
    const download = downloadLocation
      ? entry.downloads.find((candidate) => candidate.downloadLocation === downloadLocation)
      : entry.downloads.find((candidate) => candidate.mediaInfo.type === "VIDEO");
    if (!download) {
      throw new Error(`No downloaded video for ${entry.contentInfo.title}`);
    }
    const subtitlesConfig = configService.config.subtitles;
    const generators = serviceLocator.getSubtitleGenerators(subtitlesConfig?.servicePriorities);
    if (!generators.length) {
      throw new Error("No subtitles services are configured");
    }
    const execution = this.generateSubs(
      entry.contentInfo,
      download.mediaInfo,
      download.downloadLocation,
      language,
      generators,
      backfillJobId
    );
    // Queued and left to the queue, rather than awaited here.
    //
    // Awaiting was what made a bulk run's items invisible: the run held each
    // one until it finished, so only the item currently running had a
    // pipeline to show and the rest existed nowhere the UI could see. A run
    // is a dispatcher - what it queues is the same work the content page
    // queues, and once queued it is an ordinary subtitle pipeline that can
    // be reordered, paused or cancelled like any other.
    //
    // The result is recorded from the completion event for the same reason
    // the single-item endpoint does it that way: there is no longer anyone
    // waiting to record it.
    execution.on("completed", (result) => {
      if (result.status !== "success") {
        return;
      }
      const { language: generatedLanguage, service, path } = result.pipelineResult;
      db.subsGenerated(contentKey, download.downloadLocation, {
        language: generatedLanguage,
        service,
        path,
      }).catch((e) => logger.log("error", `Could not record generated subtitles for ${contentKey}: ${e}`));
    });
    return "subtitles";
  }

  /**
   * Analyses one item as part of a bulk run.
   *
   * Looks for a Digital Foundry article first, exactly as the single-item
   * path does - the article is grounding that materially improves the
   * result, so a bulk run that skipped it would produce systematically
   * worse analyses than analysing the same items one at a time.
   */
  private async runAnalysisForContent(
    contentKey: string,
    config: AiAnalysisConfig,
    backfillJobId?: string,
    force?: boolean,
    sources?: AiAnalysisSourceSelection,
    provider?: AiProviderId
  ) {
    const db = serviceLocator.db;
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      throw new Error(`Content ${contentKey} not found`);
    }
    // Skipped entirely when the article is deselected - the lookup can reach
    // Digital Foundry, and over a bulk run that is a lot of requests to make
    // for something the run has been told not to read.
    const effectiveSources = sources ?? config.sources;
    const article = effectiveSources.article
      ? await ensureArticleForContent(db, entry.contentInfo).catch(() => undefined)
      : undefined;
    // Queued and left to the queue, as the subtitle path is, so a run's items
    // are all visible at once rather than one at a time.
    //
    // Safe to do here now: the analysis task re-checks immediately before
    // spending anything, so an item that gets analysed while it waits its turn
    // is not paid for twice. That check is what kept this awaiting.
    this.analyseContent(entry, config, {
      articleText: article?.text,
      articleUrl: article?.url,
      articleTitle: article?.title,
      backfillJobId,
      force,
      sources,
      provider,
    });
    return "analysed";
  }

  /**
   * Rewrites one downloaded file's metadata from the selected sources.
   *
   * Queued by how much work it actually is, which is not the same for every
   * run:
   *
   * - A change that touches chapters or subtitles is a full remux - reading
   *   and writing the whole file - so it goes on the media processing manager,
   *   which runs one at a time. That is the same queue muxing and sidecar
   *   writes use, so a rewrite can never land on a file another job is already
   *   touching, and several multi-gigabyte rewrites never contend on a NAS
   *   array.
   * - A tag-only change rewrites about a megabyte of `moov` and never touches
   *   the media data (see mp4-tags.ts). Serialising those behind whole-file
   *   work would make a library-wide AI tag backfill take hours for no reason,
   *   so they go on the file manager and its limit of 5 instead.
   *
   * Decided from the metadata actually built rather than from the options
   * asked for: `fromYouTube` only yields chapters if the remote fetch found
   * any, and without them the run really is tag-only.
   */
  private async runMetadataForContent(contentKey: string, options: MetadataBackfillOptions) {
    const db = serviceLocator.db;
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      throw new Error(`Content ${contentKey} not found`);
    }
    const built = await buildMetadataForBackfill(entry, options);
    if (!built) {
      throw new Error(`No downloaded file for ${entry.contentInfo.title}`);
    }
    const tagOnly = !built.meta.subtitles && !built.meta.chapters?.length;
    const taskManager = tagOnly ? this.fileTaskManager : this.mediaProcessingTaskManager;
    const task = taskManager.addTask(InjectMetadataTask(built.downloadLocation, built.meta));
    this.trackTask(task);
    await task.task.awaitResult();
    /*
     * Fingerprinted from what was actually written, not from the entry - the
     * built metadata has already merged in accepted AI tags and any YouTube
     * description, so re-deriving it here would record something the file does
     * not contain and leave the item permanently stale.
     */
    await db.metadataWritten(
      contentKey,
      built.downloadLocation,
      metadataFingerprintOf({
        title: built.meta.title,
        publishedDate: built.meta.publishedDate,
        description: built.meta.description,
        tags: built.meta.tags,
      })
    );
    return "metadata written";
  }

  /**
   * Queues one bulk backfill run over the given items.
   *
   * The items are taken as given; deciding whether each still needs the
   * work happens inside the task, against live state, as each comes up -
   * see stillNeedsWork in bulk-backfill-task.ts.
   */
  bulkBackfill(
    contentKeys: string[],
    target: BulkBackfillTarget,
    force: boolean,
    language: string,
    sources?: AiAnalysisSourceSelection,
    metadataOptions?: MetadataBackfillOptions,
    provider?: AiProviderId
  ) {
    // Assigned the moment the task exists, which is after these options are
    // built - the closures below only run later, once it is dispatching.
    let jobId: string | undefined;
    const task = this.bulkOperationsTaskManagers[target].addTask(
      BulkBackfillTask(
        contentKeys.map((contentKey) => ({ contentKey })),
        {
          target,
          force,
          language,
          db: serviceLocator.db,
          aiAnalysisConfig: configService.config.aiAnalysis,
          runSubtitles: (contentKey: string) => this.runSubtitlesForContent(contentKey, language, jobId),
          runAnalysis: (contentKey: string) => {
            const config = configService.config.aiAnalysis;
            if (!config) {
              return Promise.reject(new Error("AI analysis is not configured"));
            }
            return this.runAnalysisForContent(contentKey, config, jobId, force, sources, provider);
          },
          runMetadata: (contentKey: string) =>
            this.runMetadataForContent(contentKey, metadataOptions ?? { fromYouTube: false, fromAnalysis: false }),
        },
        { maxConcurrent: BULK_BACKFILL_CONCURRENCY[target] }
      )
    );
    jobId = task.task.id;
    logger.log(
      "info",
      `Queued bulk backfill: ${target} over ${contentKeys.length} item(s)${force ? " (forced)" : ""}`
    );
    return this.trackTask(task);
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
    logger.log("info", `Queued batch move of ${toMove.length} file(s)${overwrite ? " (overwriting)" : ""}`);
    return this.trackTask(fileMoveTask);
  }

  clearMissingFiles() {
    logger.log("info", "Queued clear-missing-files scan");
    const removeMissingFilesTask = this.maintenanceOperationsTaskManager.addTask(ClearMissingFilesTask());
    return this.trackTask(removeMissingFilesTask);
  }

  scanForExistingContent(contentManager: DigitalFoundryContentManager) {
    logger.log("info", "Queued scan for already-downloaded files in the destination directory");
    const scanForExistingContentTask = this.maintenanceOperationsTaskManager.addTask(ScanForExistingContentTask(contentManager));
    return this.trackTask(scanForExistingContentTask);
  }

  removeEmptyDirs(dir: string) {
    logger.log("info", `Queued removal of empty directories under ${dir}`);
    const removeEmptyDirsTask = this.maintenanceOperationsTaskManager.addTask(RemoveEmptyDirsTask(dir));
    return this.trackTask(removeEmptyDirsTask);
  }

  async clearCompletedPipelineExecs() {
    this.pipelineExecutions.forEach((execution, name) => {
      if (execution.isCompleted) {
        this.pipelineExecutions.delete(name);
      }
    });
    // Finished pipelines are persisted as well, and the tasks endpoint tops
    // the list back up from that history - so clearing only the in-memory
    // copies left the list looking untouched as soon as it next polled.
    await serviceLocator.completedPipelineDb?.clear();
    this.notifyChanged();
  }

  async clearCompletedPipelineExec(id: string) {
    this.forgetCompletedPipelineExec(id);
    // Deliberately not conditional on there being a live execution: an entry
    // restored from a previous run exists only in the history, and is exactly
    // the kind of thing someone clears individually.
    await serviceLocator.completedPipelineDb?.remove(id);
    this.notifyChanged();
  }

  /**
   * Drops the in-memory copy but leaves the history alone.
   *
   * Separate from clearCompletedPipelineExec because autoClearCompletedPipelines
   * means "don't accumulate finished pipelines in the running list", not
   * "discard the record of them" - archiving to the history and then deleting
   * it again would make that option quietly destroy what it just wrote.
   */
  private forgetCompletedPipelineExec(id: string) {
    const execution = this.pipelineExecutions.get(id);
    if (execution && execution.isCompleted) {
      this.pipelineExecutions.delete(id);
      this.notifyChanged();
    }
  }

  clearCompletedTasks() {
    this.tasks.forEach((task, name) => {
      if (task.isCompleted()) {
        this.tasks.delete(name);
      }
    });
    this.notifyChanged();
  }

  clearCompletedTask(id: string) {
    const task = this.tasks.get(id);
    if (task && task.isCompleted()) {
      this.tasks.delete(id);
      this.notifyChanged();
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
          // Nothing running means nothing to pause, so it is held out of the
          // queue instead - see TaskManager.setTaskHeld. Without this, pausing
          // a queued item returned success and left it to start anyway.
          if (managedTask.task.getTaskState() === "running") {
            managedTask.task.pause("manual");
          } else {
            managedTask.taskManager.setTaskHeld(managedTask.task.id, true);
          }
          break;
        case "resume":
          managedTask.taskManager.setTaskHeld(managedTask.task.id, false);
          // Only a task that genuinely paused has anything to resume; one that
          // was merely held is already startable again by releasing it.
          if (managedTask.task.getTaskState() === "paused") {
            managedTask.resume();
          }
          break;
        case "cancel":
          managedTask.task.cancel();
          break;
        case "force_start":
          // Returned rather than discarded: "started" and "next in line when a
          // slot frees" are different answers and the user should see which.
          return managedTask.forceStart();
      }
    }
  }

  async controlPipeline(controlPipelineRequest: ControlPipelineRequest) {
    const { pipelineExecutionId, stepId, action } = controlPipelineRequest;
    // Checked before the lookup below, not after it: a pipeline from a
    // previous run has no live execution, so demanding one made clearing
    // precisely those entries fail with "no task with id".
    if (action === "clear") {
      return this.clearCompletedPipelineExec(pipelineExecutionId);
    }
    const pipeline = this.pipelineExecutions.get(pipelineExecutionId);
    if (!pipeline) {
      throw new Error(`No task with id ${pipelineExecutionId}`);
    }
    // Cancelling goes through the pipeline, not its current task. Cancelling
    // the task does nothing when nothing has started yet, which is the state
    // most of a queued run is in - so Stop on a queued item used to return
    // success and leave it in the queue to start later. Same fix the bulk stop
    // already had; this is the per-item control catching up.
    if (action === "cancel" && !stepId) {
      pipeline.cancel();
      return;
    }
    /*
     * Force start goes through the pipeline for the same reason cancel does:
     * the user is asking for this item to finish, not for one step to run.
     * Forcing only the current task left the pipeline stalling at the next step
     * boundary with the queue still held - which is what made people press the
     * button again at every step, and every one of those hand-starts bypassed
     * the manager's bookkeeping.
     */
    if (action === "force_start" && !stepId) {
      const outcome = pipeline.forceRunNow();
      this.notifyChanged();
      return outcome;
    }
    const step = stepId ? pipeline.getStepById(stepId) : pipeline.getCurrentStep();
    const managedTask = step?.managedTask as GenericManagedTask | undefined;
    if (!managedTask?.task) {
      throw new Error(`No curent task for taskInfo ${pipelineExecutionId}`);
    }
    const outcome = this.controlTaskManagerTask(managedTask, action);
    // Holding a task does not change the task's own state, so the
    // taskStateChanged event that normally pushes a fresh snapshot never
    // fires - without this the hold is invisible until something else moves.
    this.notifyChanged();
    return outcome;
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
    this.notifyChanged();
  }

  /**
   * Pause or resume everything that will take it.
   *
   * Deliberately best-effort. Not every running step can stop where it is - a
   * remux mid-file, an API call already in flight - and the useful behaviour
   * is to pause what can pause and carry on, rather than refuse the lot
   * because one step will not. Anything that declines is counted rather than
   * thrown, so the caller can say what actually happened.
   *
   * One pass over both collections, with a single change notification at the
   * end: pausing thirty things should redraw the page once, not thirty times.
   */
  /**
   * Stop what one bulk run queued.
   *
   * The run itself cannot be cancelled once it has dispatched - it is a
   * dispatcher and finishes the moment the last item is queued - so
   * "stop that run" has to mean the work it left behind. Every pipeline it
   * queued carries its id for exactly this.
   *
   * Work already finished is left alone, and so is anything queued by hand or
   * by a different run: stopping one run must not take the rest of the queue
   * with it.
   */
  cancelBackfillJob(backfillJobId: string): { cancelled: number; stillRunning: number } {
    let cancelled = 0;
    let stillRunning = 0;
    for (const pipeline of this.pipelineExecutions.values()) {
      if (pipeline.isCompleted) {
        continue;
      }
      const context = pipeline.context as { backfillJobId?: string };
      if (context?.backfillJobId !== backfillJobId) {
        continue;
      }
      // Counted before the attempt, because the two outcomes are genuinely
      // different and only one of them is reliable. A queued pipeline is taken
      // out of the queue and is definitely stopped. A running one is asked to
      // stop and may simply decline - transcription does, and finishes - so
      // reporting it as cancelled would be a claim this cannot make.
      const runningNow =
        (pipeline.getCurrentStep()?.managedTask as GenericManagedTask | undefined)?.task?.getTaskState() === "running";
      try {
        // Cancels the pipeline rather than its current task: cancelling the
        // task does nothing when there is nothing running yet, which is the
        // state most of a stopped run is in.
        if (pipeline.cancel()) {
          if (runningNow) {
            stillRunning++;
          } else {
            cancelled++;
          }
        }
      } catch {
        // Already stopping, or past the point of stopping. Not counted, since
        // the number is meant to say what this call did.
      }
    }
    if (cancelled) {
      this.notifyChanged();
    }
    return { cancelled, stillRunning };
  }

  async controlAll(
    action: "pause" | "resume" | "stop"
  ): Promise<{ affected: number; skipped: number; queueHeld: boolean }> {
    if (action === "stop") {
      /*
       * Cancels rather than holds, so this is the one that throws work away.
       *
       * Goes through the pipeline for the same reason the per-item Stop does:
       * cancelling the current task does nothing to anything that has not
       * begun, which is most of a queue. Counted the same way too - a queued
       * item is definitely stopped, a running one is asked and may decline.
       */
      let cancelled = 0;
      let stillRunning = 0;
      for (const pipeline of this.pipelineExecutions.values()) {
        if (pipeline.isCompleted) {
          continue;
        }
        const runningNow =
          (pipeline.getCurrentStep()?.managedTask as GenericManagedTask | undefined)?.task?.getTaskState() ===
          "running";
        try {
          if (pipeline.cancel()) {
            runningNow ? stillRunning++ : cancelled++;
          }
        } catch {
          // Already past the point of stopping.
        }
      }
      for (const task of this.tasks.values()) {
        if (task.isCompleted()) {
          continue;
        }
        try {
          task.task.cancel();
          cancelled++;
        } catch {
          stillRunning++;
        }
      }
      this.notifyChanged();
      // The hold is left exactly as it was: stopping is about the work in
      // flight, and silently releasing a hold someone set would start the next
      // thing the moment it was queued.
      return { affected: cancelled, skipped: stillRunning, queueHeld: this.allTaskManagers.some((m) => m.isQueueHeld()) };
    }
    /*
     * Two separate things, and only together do they mean "pause everything".
     *
     * Holding the queues is the part that always works: nothing new starts
     * until it is released. This matters more than it sounds, because a queued
     * task cannot be paused on its own - pause() is implemented per task type
     * and does nothing to one that has not begun. Without the hold, pausing a
     * queue of five transcriptions stopped none of them: the running one
     * carried on and the next started the instant it finished.
     *
     * Pausing the already-running tasks is the part that is best-effort, since
     * some cannot stop where they are. Those are counted and reported rather
     * than quietly left out.
     */
    const held = action === "pause";
    for (const manager of this.allTaskManagers) {
      manager.setQueueHeld(held);
    }

    let affected = 0;
    let skipped = 0;
    const apply = (managedTask?: GenericManagedTask) => {
      if (!managedTask?.task || managedTask.isCompleted()) {
        return;
      }
      const state = managedTask.task.getTaskState();
      // Only what is actually in flight. Queued work is covered by the hold,
      // and counting it here would inflate the number with tasks that were
      // never going to be touched.
      const relevant = action === "pause" ? state === "running" : state === "paused";
      if (!relevant) {
        return;
      }
      // task.pause() on something that cannot pause returns happily and does
      // nothing, so this asks the same capability list the UI uses to decide
      // whether to offer a pause button, rather than trusting the call.
      if (!makeTaskInfo(managedTask, null).capabilities.includes("pause")) {
        skipped++;
        return;
      }
      try {
        this.controlTaskManagerTask(managedTask, action);
        affected++;
      } catch {
        skipped++;
      }
    };
    for (const pipeline of this.pipelineExecutions.values()) {
      if (pipeline.isCompleted) {
        continue;
      }
      apply(pipeline.getCurrentStep()?.managedTask as GenericManagedTask | undefined);
    }
    for (const task of this.tasks.values()) {
      apply(task);
    }
    this.notifyChanged();
    return { affected, skipped, queueHeld: held };
  }

  async control(controlRequest: ControlRequest) {
    if (isControlPipelineRequest(controlRequest)) {
      await this.controlPipeline(controlRequest);
    } else {
      this.controlTask(controlRequest);
    }
    // Reordering and priority changes alter the response without moving any
    // task's state, so they'd otherwise go unannounced until the next sample.
    this.notifyChanged();
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

/**
 * Converts a step result into something that can actually be written to disk.
 *
 * Step results are whatever the step returned, and some of them are live
 * objects rather than data - the download step's result reaches back into the
 * downloader, which holds references that cycle. Persisting one directly
 * threw "Converting circular structure to JSON" on every write *after* the
 * first, which was the worst possible failure mode: the initial record (with
 * no results yet) saved fine, so a pipeline looked persisted while silently
 * never advancing past step 0. A restart then dutifully restarted the
 * download it was supposed to be protecting.
 *
 * Cycles are tracked by ancestry rather than by everything seen, so an object
 * legitimately referenced twice in different branches is kept both times -
 * only genuine cycles are dropped. Functions are dropped; Dates are kept
 * as-is for the schema to coerce back.
 */
const toPersistableResult = (value: unknown, ancestors: Set<object> = new Set()): any => {
  if (typeof value === "function") {
    return undefined;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (ancestors.has(value)) {
    return undefined;
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry) => toPersistableResult(entry, ancestors));
    }
    const toReturn: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      const converted = toPersistableResult(entry, ancestors);
      if (converted !== undefined) {
        toReturn[key] = converted;
      }
    }
    return toReturn;
  } finally {
    ancestors.delete(value);
  }
};

/**
 * Snapshot of a pipeline in the form that survives a restart.
 *
 * Only the context fields that are actually needed to continue are kept -
 * notably not the request headers (they carry the Digital Foundry autologin
 * cookie) or the download URL (a time-limited signed link). See
 * PersistedPipeline.
 */
export const makePersistedPipeline = (taskPipelineExecution: PipelineExecutionTypes): PersistedPipeline => {
  const { pipelineType, id, startTime } = taskPipelineExecution;
  const steps = taskPipelineExecution.getSteps();
  const currentStep = taskPipelineExecution.getCurrentStep();
  const context: any = taskPipelineExecution.context;
  const stepOrder = steps.map(({ step }) => step.id);
  const stepNames = steps.reduce<Record<string, string>>((toReturn, { step }) => {
    toReturn[step.id] = String(step.name);
    return toReturn;
  }, {});
  const stepResults: Record<string, PersistedStepResult> = {};
  steps.forEach(({ step, managedTask }) => {
    const result = managedTask?.task?.result;
    if (!result) {
      return;
    }
    stepResults[step.id] = {
      status: result.status === "success" ? "success" : result.status === "cancelled" ? "cancelled" : "failed",
      result: result.status === "success" ? toPersistableResult(result.result) : undefined,
      error: result.status === "failed" ? makeErrorMessage(result.error) : undefined,
      startTime: managedTask?.task?.startTime || undefined,
      endTime: managedTask?.task?.endTime || undefined,
    };
  });
  const currentStepIndex = currentStep ? Math.max(0, stepOrder.indexOf(currentStep.step.id)) : 0;
  return {
    id,
    pipelineType,
    contentKey: context?.dfContentInfo?.key || "",
    mediaFormat: context?.mediaInfo?.formatString,
    queuedTime: startTime || new Date(),
    currentStepIndex,
    stepOrder,
    stepNames,
    stepResults,
    context: {
      downloadLocation: context?.downloadLocation,
      finalLocation: context?.finalLocation,
      fileAtFinalLocation: context?.fileAtFinalLocation,
      // What a non-download pipeline needs to be rebuilt, and the run that
      // queued it, so a restart does not orphan it from its own Stop button.
      fileLocation: context?.fileLocation,
      language: typeof context?.language === "string" ? context.language : undefined,
      backfillJobId: context?.backfillJobId,
    },
    resumeAttempts: context?.resumeAttempts ?? 0,
  };
};

/**
 * Rebuilds a UI-shaped pipeline from a completed record on disk.
 *
 * The task list is otherwise built purely from in-memory executions, so a
 * restart made every finished download vanish from the view even though the
 * history was being written to disk. This is what makes that history
 * visible again.
 *
 * Step tasks are synthesised from the persisted step results rather than
 * left empty, so the details dialog works on historical runs too - which is
 * the case it matters most for: a failure you want to look at after the
 * fact is exactly the one you can no longer reproduce.
 */
export const makeTaskPipelineInfoFromPersisted = (
  record: CompletedPipeline,
  dfContent: DfContentInfo
): TaskPipelineInfo => {
  const stepTasks: Record<string, any> = {};
  record.stepOrder.forEach((stepId, index) => {
    const stepResult = record.stepResults[stepId];
    if (!stepResult) {
      return;
    }
    stepTasks[stepId] = {
      id: stepId,
      type: "task",
      taskType: record.stepNames?.[stepId] || "task",
      capabilities: [],
      // Positions are meaningless for something already finished - nothing
      // is queued behind it.
      priority: -1,
      position: -1,
      priorityPosition: -1,
      startTime: stepResult.startTime,
      endTime: stepResult.endTime,
      status: {
        state: stepResult.status,
        attempt: 1,
        isComplete: true,
        error: stepResult.error,
      },
    };
  });
  return {
    id: record.id,
    type: "pipeline",
    pipelineType: record.pipelineType,
    pipelineDetails: {
      id: record.id,
      type: record.pipelineType,
      queuedTime: record.queuedTime,
      dfContent,
      mediaFormat: record.mediaFormat || "",
      destinationPath: record.context.finalLocation,
      stepOrder: record.stepOrder,
      steps: record.stepOrder.reduce<Record<string, StepDetails>>((toReturn, stepId) => {
        toReturn[stepId] = { id: stepId, name: record.stepNames?.[stepId] || stepId };
        return toReturn;
      }, {}),
    },
    pipelineStatus: {
      // The last step that actually produced a result. Without this the UI's
      // pipeline track has no reference point, so every step lacking a result
      // renders as "pending" (never reached) rather than "skipped" (passed
      // over) - which is exactly the distinction the track exists to draw, and
      // it was wrong for all restored history after a restart.
      currentStep: [...record.stepOrder].reverse().find((stepId) => record.stepResults[stepId]),
      statusMessage:
        record.result === "success"
          ? "Completed"
          : record.result === "cancelled"
            ? "Cancelled"
            : "Failed",
      isComplete: true,
      pipelineResult: record.result,
    },
    stepTasks,
  };
};

export const makeTaskPipelineInfo = (
  taskPipelineExecution: PipelineExecutionTypes
): TaskPipelineInfo => {
  const notApplicableReasons = getDownloadStepNotApplicableReasons(configService.config.subtitles);
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
      backfillJobId:
        "backfillJobId" in taskPipelineExecution.context
          ? (taskPipelineExecution.context.backfillJobId as string | undefined)
          : undefined,
      dfContent: taskPipelineExecution.context.dfContentInfo,
      mediaFormat: mediaInfo?.formatString || "",
      stepOrder: steps.map(({ step }) => step.id),
      steps: steps.reduce((acc, { step, managedTask }) => {
        acc[step.id] = {
          id: step.id,
          name: step.name,
          // Evaluated from live config rather than frozen when the pipeline
          // object was built: the pipeline definition is created once at
          // startup and reused for every download, so freezing it there would
          // pin a prediction made before the service had run at all. Deriving
          // it per snapshot means changing the setting mid-download updates
          // what the UI says will happen - which is the truthful answer.
          notApplicableReason: notApplicableReasons[step.name],
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
    stepTasks: steps.reduce((acc, { step, managedTask }, index) => {
      if (managedTask && managedTask.task) {
        acc[step.id] = makeTaskInfo(managedTask, positionInfoMap.get(managedTask.task.id) || null);
        return acc;
      }
      // No task for this step in *this* run, but a result seeded into the
      // pipeline means it completed in a previous one and was carried
      // forward on resume. Reported as such, because otherwise it's
      // indistinguishable from a step that was deliberately skipped.
      const seededResult: any = (taskPipelineExecution.results as any)?.[index];
      if (seededResult) {
        acc[step.id] = {
          id: `${step.id}-carried-over`,
          type: "task",
          taskType: String(step.name),
          capabilities: [],
          priority: -1,
          position: -1,
          priorityPosition: -1,
          carriedOver: true,
          status: {
            state: seededResult.status === "success" ? "success" : "failed",
            attempt: 1,
            isComplete: true,
          },
        };
      }
      return acc;
    }, {} as Record<string, BasicTaskInfo | DownloadTaskInfo>),
  };
};

const makeTaskInfo = (
  managedTask: ManagedTask<any, any>,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo | DownloadTaskInfo => {
  return withForceStartCapability(makeTaskInfoInner(managedTask, positionInfo), managedTask);
};

const makeTaskInfoInner = (
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
  } else if (isBulkBackfillTask(managedTask.task)) {
    return makeBulkBackfillTaskInfo(managedTask, positionInfo);
  } else if (isSubtitlesTask(managedTask.task)) {
    return makeSubtitlesTaskInfo(managedTask, positionInfo);
  } else {
    return makeBasicTaskInfo(managedTask, positionInfo);
  }
};

/**
 * Adds `force_start` where the task type may exceed its manager's limit.
 *
 * Derived from the task rather than declared in each of the makers above, so
 * there is one source of truth and it cannot drift from what the manager will
 * actually allow. Everything can be forced past a paused queue; this says only
 * whether it may also take an extra slot, which is what the confirm dialog
 * needs to word itself honestly.
 */
const withForceStartCapability = (
  info: BasicTaskInfo | DownloadTaskInfo,
  managedTask: ManagedTask<any, any>
): BasicTaskInfo | DownloadTaskInfo =>
  managedTask.task.canBreakConcurrency > 0
    ? { ...info, capabilities: [...info.capabilities, "force_start" as const] }
    : info;

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
  // A held task is idle as far as it knows - the hold lives in the task
  // manager's selection, not in the task - so it is reported as paused here.
  // Otherwise pausing a queued item looked like it had done nothing.
  const held = managedTask.taskManager?.isTaskHeld(task.id) ?? false;
  return {
    state: held && !task.isCompleted() ? "paused" : taskState,
    held: held || undefined,
    pauseTrigger: held ? "manual" : task.pauseTrigger || undefined,
    isComplete: task.isCompleted(),
    attempt: managedTask.attempt,
    message: task.getStatusMessage(),
    error: taskError ? makeErrorMessage(taskError) : undefined,
    forceStarted: task.forceRunFlag || undefined,
    progress: statusDetail?.progress,
    accumulatedActiveMs: task.accumulatedActiveMs,
    lastResumedAt: task.lastResumedAt,
  };
}

/**
 * How many failures a run reports individually.
 *
 * The whole task snapshot is pushed to every connected browser on every
 * change, so a run of three thousand items that failed wholesale would
 * otherwise send three thousand rows several times a second. The counts
 * still tell the true story; the list is there to be read.
 */
const BACKFILL_FAILURE_LIMIT = 50;

/**
 * A tally of what a backfill run actually did.
 *
 * Without this a finished run said only "Done", which is the one thing you
 * already knew. The interesting part is the split - a run of 300 that
 * produced 4 results is not a failure if 296 of them already had the thing,
 * and is a real problem if they were skipped for want of a transcript.
 */
const makeBulkBackfillTaskInfo = (
  managedTask: GenericManagedTask,
  positionInfo: PriorityPositionInfo | null
): BulkBackfillTaskInfo => {
  const common = makeCommonTaskInfo(managedTask, positionInfo);
  const detail = managedTask.task.getStatus() as { moveStatuses?: any[] } | undefined;
  const operations = detail?.moveStatuses ?? [];

  let done = 0;
  let skipped = 0;
  let notApplicable = 0;
  let failed = 0;
  let pending = 0;
  const failures: { contentKey: string; error: string }[] = [];

  for (const operation of operations) {
    const contentKey = operation?.params?.contentKey ?? "unknown";
    if (operation?.error) {
      failed++;
      if (failures.length < BACKFILL_FAILURE_LIMIT) {
        const error = operation.error;
        failures.push({ contentKey, error: error?.message ? String(error.message) : String(error) });
      }
      continue;
    }
    if (!operation?.endTime) {
      pending++;
      continue;
    }
    switch (operation.result) {
      case "done":
        done++;
        break;
      case "skipped":
        skipped++;
        break;
      case "not_applicable":
        notApplicable++;
        break;
      default:
        // Finished with no recorded outcome - counted as pending rather
        // than invented as a success.
        pending++;
    }
  }

  return {
    ...common,
    taskType: "bulk_backfill",
    // The batch builder implements all three, so the row can offer them.
    capabilities: ["pause", "cancel"],
    status: common.status
      ? {
          ...common.status,
          backfill: {
            total: operations.length,
            done,
            skipped,
            notApplicable,
            failed,
            pending,
            failures,
            failuresTruncated: failed > failures.length,
          },
        }
      : null,
  };
};

/**
 * Subtitles declare cancel, unlike most task types.
 *
 * `capabilities` is the honest signal the UI reads, and transcription is the
 * one long-running local job worth being able to take back - it can hold a
 * one-at-a-time queue for an hour.
 */
const makeSubtitlesTaskInfo = (
  managedTask: GenericManagedTask,
  positionInfo: PriorityPositionInfo | null
): BasicTaskInfo => {
  return {
    ...makeCommonTaskInfo(managedTask, positionInfo),
    capabilities: ["cancel"],
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
