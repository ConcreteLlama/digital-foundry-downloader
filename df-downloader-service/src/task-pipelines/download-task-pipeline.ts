import { DfContentInfo, MediaInfo, logger, makeErrorMessage, metadataFingerprintOf } from "df-downloader-common";
import { configService } from "../config/config.js";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { DownloadUrlOpt } from "../download/download-url.js";
import { serviceLocator } from "../services/service-locator.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { DownloadTask, DownloadTaskManager } from "../tasks/download-task.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { MoveFileSetDateTask } from "../tasks/move-file-set-date-task.js";
import { DfContentAvailability } from "df-downloader-common";
import { AiAnalysisTaskBuilder, AiAnalysisTaskManager } from "../tasks/ai-analysis-task.js";
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config.js";
import { srtLinesToText } from "../utils/ai/transcript.js";
import { SubtitlesTaskBuilder, SubtitlesTaskManager } from "../tasks/subtitles-task.js";
import { makeFilePathWithTemplate } from "../utils/template-utils.js";
import { pathIsEqual } from "../utils/file-utils.js";
import { FetchChaptersTask } from "../tasks/fetch-chapters-task.js";
import { MeasureDurationTask } from "../tasks/measure-duration-task.js";
import { WriteSubtitlesSidecarTask } from "../tasks/write-subtitles-sidecar-task.js";
import { resolveSubtitlesOutput } from "../media-utils/subtitles/sidecar.js";
import { GeneratedSubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { Chapter } from "../utils/chatpers.js";

/**
 * Where each step's result lands in `allResults`.
 *
 * The results array is pre-sized to the number of steps and written at the
 * step's own index, so a skipped step leaves a hole rather than shifting
 * anything - which means these are positions in the chain below, and
 * inserting a step shifts every index after it.
 *
 * Named because reading them positionally already went wrong once: adding
 * "Analyse Content" in the middle pushed Inject Metadata from 4 to 5, and
 * Move File carried on reading index 4 - so it judged whether injection had
 * succeeded from the analysis result, and with analysis switched off it read
 * a hole and concluded failure every time.
 */
const STEP = {
  download: 0,
  measureDuration: 1,
  fetchChapters: 2,
  generateSubtitles: 3,
  analyseContent: 4,
  injectMetadata: 5,
  moveFile: 6,
  writeSubtitles: 7,
} as const;

type DownloadTaskPipelineOpts = {
  downloadTaskManager: DownloadTaskManager;
  subtitlesTaskManager: SubtitlesTaskManager;
  /** Cheap filesystem work - see df-task-manager.ts. */
  fileTaskManager: TaskManager;
  /** Whole-file reads/writes (remux, move) - serialized, see df-task-manager.ts. */
  mediaProcessingTaskManager: TaskManager;
  /** Serialized YouTube page fetches. */
  youtubeFetchTaskManager: TaskManager;
  /** Remote API calls - see tasks/ai-analysis-task.ts for why concurrency is kept low. */
  aiAnalysisTaskManager: AiAnalysisTaskManager;
};

export const createDownloadTaskPipeline = (opts: DownloadTaskPipelineOpts) => {
  const {
    downloadTaskManager,
    subtitlesTaskManager,
    fileTaskManager,
    mediaProcessingTaskManager,
    youtubeFetchTaskManager,
    aiAnalysisTaskManager,
  } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      mediaInfo: MediaInfo;
      url: DownloadUrlOpt;
      downloadLocation: string;
      finalLocation?: string;
      /**
       * Set when metadata injection wrote the finished file directly to
       * finalLocation, so the Move File step knows there's nothing left to
       * move (see ContentManagementConfig.writeDirectToDestination).
       */
      fileAtFinalLocation?: boolean;
      /**
       * A fingerprint of the metadata actually embedded, set only when this
       * pipeline embedded any. Recorded against the download so a later
       * backfill can tell whether the file is out of date rather than
       * offering every downloaded item - see metadataFingerprintOf.
       *
       * Taken from what was written rather than re-derived from the content
       * afterwards: the values here have already had accepted AI tags merged
       * in and a YouTube description substituted, so re-deriving would produce
       * a different fingerprint and make every fresh download look stale.
       */
      metadataFingerprint?: string;
      /**
       * How many times this pipeline has already been resumed after a
       * restart. Carried on the context so it survives into the next
       * persisted record - a resumed pipeline gets a fresh id, so without
       * this the count would reset every time and a pipeline that reliably
       * kills the process could loop forever.
       */
      resumeAttempts?: number;
      headers: HeadersInit;
    },
    "download"
  >("download")
    
.next({
      stepName: "Download",
      taskCreator: ({ context }) => {
        const { url, downloadLocation, headers } = context;
        const config = configService.config;
        const { downloads: downloadsConfig } = config;
        return new DownloadTask({
          url,
          destination: downloadLocation,
          label: `download-${context.dfContentInfo.name}`,
          headers,
          maxConnections: config.downloads.maxConnectionsPerDownload,
          resolveOptions: {
            resolveOnResume: true,
            resolveOnRetry: true,
          },
          connectionResolveOpts: {
            resolvePerConnection: false,
            resolveOnResume: false,
            resolveOnRetry: true,
          },
          retries: {
            maxRetries: downloadsConfig.maxRetries,
            retryDelay: downloadsConfig.failureRetryIntervalBase,
            retryDelayMultiplier: downloadsConfig.retryDelayMultiplier,
            maxRetryDelay: downloadsConfig.maxRetryDelay,
          },
          connectionRetries: {
            maxRetries: downloadsConfig.connectionMaxRetries,
            retryDelay: downloadsConfig.connectionRetryDelayBase,
            retryDelayMultiplier: downloadsConfig.connectionRetryDelayMultiplier,
            maxRetryDelay: downloadsConfig.connectionMaxRetryDelay,
          },
        });
      },
      taskManager: downloadTaskManager,
    })
    // Measure before fetching anything from YouTube: the file's real
    // duration is what reveals that DF cut the sponsorship read out of it,
    // and both the chapter and subtitle steps below need to know that.
    .next({
      stepName: "Measure Duration",
      taskCreator: ({ context }) => {
        const { dfContentInfo, downloadLocation } = context;
        return MeasureDurationTask(dfContentInfo.key, downloadLocation);
      },
      continueOnFail: true,
      taskManager: fileTaskManager,
    })
    // Chapters come before subtitles because locating the sponsorship
    // segment needs both the measured duration above and YouTube's chapter
    // list, and the injection step below wants the corrected result.
    .next({
      stepName: "Fetch Chapters",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo } = context;
        const [_downloadTaskResult, measureTaskResult] = allResults;
        const measured = measureTaskResult?.status === "success" ? measureTaskResult.result : null;
        return FetchChaptersTask(dfContentInfo, measured?.durationSeconds ?? null);
      },
      continueOnFail: true,
      // Hits YouTube, not the disk - belongs on the serialized YouTube
      // manager, same as the update-metadata pipeline's equivalent step.
      // Previously ran on fileTaskManager, which allowed up to 5 concurrent
      // YouTube page fetches from this pipeline.
      taskManager: youtubeFetchTaskManager,
    })
    .next({
      stepName: "Generate Subtitles",
      taskCreator: ({ context }) => {
        const { dfContentInfo, downloadLocation } = context;
        const config = configService.config;
        const subtitlesConfig = config.subtitles;
        // Only the during_download mode generates subtitles inline. after_download
        // runs them once the file has been filed; off never does.
        if (subtitlesConfig?.automaticGeneration === "during_download") {
          const subtitleGenerator = serviceLocator.getSubtitleGenerators(subtitlesConfig.servicePriorities);
          const subtitleTask = SubtitlesTaskBuilder({
            subtitleGenerators: subtitleGenerator,
            dfContentInfo: dfContentInfo,
            filePath: downloadLocation,
            language: "en",
          });
          return subtitleTask;
        } else {
          return null;
        }
      },
      continueOnFail: true,
      taskManager: subtitlesTaskManager,
    })
    .next({
      stepName: "Analyse Content",
      /**
       * Inline analysis, for the during_download mode only.
       *
       * Placed after subtitle generation so an inline-generated transcript
       * is available to it, and given that transcript directly: the
       * download is not recorded in the DB until this whole pipeline
       * succeeds, so there is no download entry yet for the usual sidecar
       * lookup to find.
       *
       * continueOnFail, like the steps around it - an API outage or a
       * spent quota must not cost the user a completed download.
       */
      taskCreator: ({ context, allResults }) => {
        const aiConfig = configService.config.aiAnalysis;
        if (aiConfig?.automaticGeneration !== "during_download" || !AiAnalysisConfigUtils.isUsable(aiConfig)) {
          return null;
        }
        const { dfContentInfo } = context;
        const [, , , subtitlesTaskResult] = allResults;
        const generatedSubtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        // Cues rather than flattened prose: the timings are what let the
        // analysis anchor its findings to moments in the video, and the
        // sidecar they could otherwise be read from may not exist yet.
        const transcriptLines = generatedSubtitles?.lines;
        return AiAnalysisTaskBuilder({
          entry: {
            key: dfContentInfo.key,
            contentInfo: dfContentInfo,
            statusInfo: { availability: DfContentAvailability.AVAILABLE, availabilityInTiers: {} },
            downloads: [],
          },
          config: aiConfig,
          transcriptLines,
        });
      },
      continueOnFail: true,
      taskManager: aiAnalysisTaskManager,
    })
    .next({
      stepName: "Inject Metadata",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo, downloadLocation } = context;
        const ytMetaTaskResult = allResults[STEP.fetchChapters];
        const subtitlesTaskResult = allResults[STEP.generateSubtitles];
        const analysisTaskResult = allResults[STEP.analyseContent];
        const config = configService.config;
        const metaConfig = config.metadata;
        const generatedSubtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        // Only hand subtitles to the remux when they're meant to be embedded.
        // In sidecar mode they're written as a separate file after the move -
        // see the Write Subtitles step below.
        const subtitles =
          generatedSubtitles &&
          resolveSubtitlesOutput(config.subtitles?.output ?? "auto", "assembling_download").embed
            ? generatedSubtitles
            : null;
        const ytMeta = ytMetaTaskResult?.status === "success" ? ytMetaTaskResult.result : null;
        const chapters = ytMeta?.chapters ?? null;
        // dfContentInfo here is the context captured when the pipeline
        // started, which may predate the Fetch Chapters step backfilling a
        // previously-missing description from YouTube - fold that in so a
        // freshly-resolved description still gets embedded in this file,
        // not just saved to the DB for next time.
        /*
         * Tags the analysis just accepted are folded in for the same reason
         * the description is: analysis runs two steps earlier and writes them
         * to the database, but this context copy was captured before the
         * pipeline started, so injecting from it embeds the tags the content
         * had on arrival and silently drops the ones just produced.
         *
         * Only accepted tags, matching what actually gets written to the
         * content - a suggestion awaiting review is not a fact about the file.
         */
        const analysis = analysisTaskResult?.status === "success" ? analysisTaskResult.result : undefined;
        const acceptedTags = (analysis?.tags ?? [])
          .filter((tag) => tag.status === "accepted")
          .map((tag) => tag.tag);
        const existingTags = dfContentInfo.tags ?? [];
        const existingLower = new Set(existingTags.map((tag) => tag.toLowerCase()));
        const tags = [...existingTags, ...acceptedTags.filter((tag) => !existingLower.has(tag.toLowerCase()))];
        const metaForInjection = metaConfig.injectMetadata
          ? { ...dfContentInfo, description: dfContentInfo.description || ytMeta?.description, tags }
          : undefined;
        if (!metaForInjection && !subtitles && !chapters) {
          // Nothing to embed, so there's no remux to redirect - the Move File
          // step below still runs and moves the download into place as usual.
          return null;
        }
        if (metaForInjection) {
          context.metadataFingerprint = metadataFingerprintOf({
            title: metaForInjection.title,
            publishedDate: metaForInjection.publishedDate,
            description: metaForInjection.description,
            tags: metaForInjection.tags,
          });
        }
        const meta = makeMediaFileMeta(metaForInjection, subtitles, chapters);
        const destination = makeFilePathWithTemplate(
          dfContentInfo,
          context.mediaInfo,
          config.contentManagement.filenameTemplate
        );
        // Remuxing straight to the destination folds the subsequent move into
        // this step, halving the post-download I/O on a large file. Skipped
        // when the download already lives at its destination, since there'd
        // be nothing to save.
        if (config.contentManagement.writeDirectToDestination && !pathIsEqual(downloadLocation, destination)) {
          context.finalLocation = destination;
          context.fileAtFinalLocation = true;
          return InjectMetadataTask(downloadLocation, meta, { outputPath: destination });
        }
        return InjectMetadataTask(downloadLocation, meta);
      },
      // A failed remux must not cost the user the download. Without this the
      // pipeline aborts here and Move File never runs, leaving a
      // fully-downloaded file stranded in the work directory because a
      // metadata step choked. The Move File step below detects the failure
      // and files the un-injected download instead.
      continueOnFail: true,
      taskManager: mediaProcessingTaskManager,
    })
    .next({
      stepName: "Move File",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo, mediaInfo } = context;
        // Reuse the destination the injection step already resolved, so the
        // two can't disagree if the filename template changed mid-pipeline.
        const destination =
          context.finalLocation ||
          makeFilePathWithTemplate(dfContentInfo, mediaInfo, configService.config.contentManagement.filenameTemplate);
        context.finalLocation = destination;
        // fileAtFinalLocation is set when the injection task is *created*, so
        // it only means "injection intended to write there" - it has to be
        // confirmed against the actual result. Results are stored by index, so
        // a skipped step leaves a hole rather than shifting anything.
        const injectTaskResult = allResults[STEP.injectMetadata];
        const injectSucceeded = injectTaskResult?.status === "success";
        if (context.fileAtFinalLocation && !injectSucceeded) {
          logger.log(
            "warn",
            `Metadata injection failed for ${dfContentInfo.name} - moving the downloaded file to ${destination} without embedded metadata rather than leaving it in the work directory`
          );
        }
        // If injection wrote the file to its destination there's nothing to
        // move, but the published date still needs setting - MoveFileSetDateTask
        // no-ops the move itself when source and destination match.
        const source = context.fileAtFinalLocation && injectSucceeded ? destination : context.downloadLocation;
        return MoveFileSetDateTask(
          source,
          destination,
          { clobber: true, mkdirp: true },
          dfContentInfo.publishedDate
        );
      },
      taskManager: mediaProcessingTaskManager,
    })
    // After the move, so the .srt lands next to the finished file rather than
    // in the work directory. Only does anything in sidecar mode; in embed
    // mode the subtitles are already inside the file.
    .next({
      stepName: "Write Subtitles",
      taskCreator: ({ context, allResults }) => {
        const subtitlesTaskResult = allResults[STEP.generateSubtitles];
        const generatedSubtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        if (!generatedSubtitles || !context.finalLocation) {
          return null;
        }
        const subtitlesConfig = configService.config.subtitles;
        const outputMode = resolveSubtitlesOutput(subtitlesConfig?.output ?? "auto", "assembling_download");
        // keepTranscript means "write the .srt as well", so it also runs in
        // embed mode - where otherwise no readable transcript is produced at
        // all, the subtitles existing only inside the container.
        if (!outputMode.sidecar && !subtitlesConfig?.keepTranscript) {
          return null;
        }
        return WriteSubtitlesSidecarTask(context.finalLocation, generatedSubtitles);
      },
      // A missing sidecar shouldn't fail a download that's otherwise complete
      // and already filed.
      continueOnFail: true,
      taskManager: fileTaskManager,
    })
    .build({
      generateStatusMessage: ({ steps, context, pipelineResult }) => {
        const finalStep = steps[steps.length - 1];
        const lastResult = finalStep?.managedTask?.task?.result;
        if (lastResult) {
          switch (lastResult.status) {
            case "success":
              return `Successfully downloaded to ${context.finalLocation}`;
            case "cancelled":
              return "Cancelled";
            case "failed":
              return makeErrorMessage(lastResult.error);
          }
        }
      },
      reduceResults: ({ context, results, steps }) => {
        const [downloadTaskResult, _measureTaskResult, _ytMetaTaskResult, subtitlesTaskResult] = results;
        const downloadResult = downloadTaskResult?.status === "success" ? downloadTaskResult.result : null;
        const subtitlesResult = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        // writeSubtitleSidecar returns where it wrote; that value was being
        // discarded, so nothing recorded where the transcript lives. Null when
        // the sidecar step was skipped, which is the common case.
        const sidecarResult = results[results.length - 1];
        const subtitlePath =
          sidecarResult?.status === "success" && typeof sidecarResult.result === "string"
            ? sidecarResult.result
            : undefined;
        return {
          dfContentInfo: context.dfContentInfo,
          mediaInfo: context.mediaInfo,
          downloadLocation: context.finalLocation!,
          metadataFingerprint: context.metadataFingerprint,
          size: downloadResult?.size,
          finalDownloadStatus: downloadResult?.finalStatus,
          attempts: steps[0].managedTask?.attempt,
          subtitles: subtitlesResult
            ? {
                service: subtitlesResult.service,
                language: subtitlesResult.language,
                path: subtitlePath,
              }
            : null,
        };
      },
    });
};
export type DownloadTaskPipeline = ReturnType<typeof createDownloadTaskPipeline>;
export type DownloadTaskPipelineExecution = ReturnType<DownloadTaskPipeline["start"]>;

export const isDownloadTaskPipelineExecution = (
  obj: TaskPipelineExecution<any, any, any, any>
): obj is DownloadTaskPipelineExecution => {
  return obj.pipelineType === "download";
};
