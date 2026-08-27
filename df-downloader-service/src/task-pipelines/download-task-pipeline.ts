import { DfContentInfo, MediaInfo, makeErrorMessage } from "df-downloader-common";
import { configService } from "../config/config.js";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { DownloadUrlOpt } from "../download/download-url.js";
import { serviceLocator } from "../services/service-locator.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { DownloadTask, DownloadTaskManager } from "../tasks/download-task.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { MoveFileSetDateTask } from "../tasks/move-file-set-date-task.js";
import { SubtitlesTaskBuilder, SubtitlesTaskManager } from "../tasks/subtitles-task.js";
import { makeFilePathWithTemplate } from "../utils/template-utils.js";
import { pathIsEqual } from "../utils/file-utils.js";
import { FetchChaptersTask } from "../tasks/fetch-chapters-task.js";
import { MeasureDurationTask } from "../tasks/measure-duration-task.js";
import { GeneratedSubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { Chapter } from "../utils/chatpers.js";

type DownloadTaskPipelineOpts = {
  downloadTaskManager: DownloadTaskManager;
  subtitlesTaskManager: SubtitlesTaskManager;
  fileTaskManager: TaskManager;
};

export const createDownloadTaskPipeline = (opts: DownloadTaskPipelineOpts) => {
  const { downloadTaskManager, subtitlesTaskManager, fileTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      mediaInfo: MediaInfo;
      url: DownloadUrlOpt;
      downloadLocation: string;
      finalLocation?: string;
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
    // Chapters now come before subtitles rather than after: locating the
    // sponsorship segment needs YouTube's chapter list, and the subtitles
    // step needs that segment to align its own timings to the file.
    .next({
      stepName: "Fetch Chapters",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo } = context;
        const [_downloadTaskResult, measureTaskResult] = allResults;
        const measured = measureTaskResult?.status === "success" ? measureTaskResult.result : null;
        return FetchChaptersTask(dfContentInfo, measured?.durationSeconds ?? null);
      },
      continueOnFail: true,
      taskManager: fileTaskManager,
    })
    .next({
      stepName: "Fetch Subtitles",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo, downloadLocation } = context;
        const config = configService.config;
        const subtitlesConfig = config.subtitles;
        if (subtitlesConfig?.autoGenerateSubs) {
          const [_downloadTaskResult, _measureTaskResult, ytMetaTaskResult] = allResults;
          const ytMeta = ytMetaTaskResult?.status === "success" ? ytMetaTaskResult.result : null;
          const subtitleGenerator = serviceLocator.getSubtitleGenerators(subtitlesConfig.servicePriorities);
          const subtitleTask = SubtitlesTaskBuilder({
            subtitleGenerators: subtitleGenerator,
            dfContentInfo: dfContentInfo,
            filePath: downloadLocation,
            language: "en",
            sponsorSegment: ytMeta?.sponsorSegment ?? null,
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
      stepName: "Inject Metadata",
      taskCreator: ({ context, allResults }) => {
        const { dfContentInfo, downloadLocation } = context;
        const [_downloadTaskResult, _measureTaskResult, ytMetaTaskResult, subtitlesTaskResult] = allResults;
        const config = configService.config;
        const metaConfig = config.metadata;
        const subtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        const ytMeta = ytMetaTaskResult?.status === "success" ? ytMetaTaskResult.result : null;
        const chapters = ytMeta?.chapters ?? null;
        // dfContentInfo here is the context captured when the pipeline
        // started, which may predate the Fetch Chapters step backfilling a
        // previously-missing description from YouTube - fold that in so a
        // freshly-resolved description still gets embedded in this file,
        // not just saved to the DB for next time.
        const metaForInjection = metaConfig.injectMetadata
          ? { ...dfContentInfo, description: dfContentInfo.description || ytMeta?.description }
          : undefined;
        if (metaForInjection || subtitles || chapters) {
          return InjectMetadataTask(downloadLocation, makeMediaFileMeta(metaForInjection, subtitles, chapters));
        }
        return null;
      },
      taskManager: fileTaskManager,
    })
    .next({
      stepName: "Move File",
      taskCreator: ({ context }) => {
        const { dfContentInfo, mediaInfo } = context;
        const destination = makeFilePathWithTemplate(dfContentInfo, mediaInfo, configService.config.contentManagement.filenameTemplate);
        context.finalLocation = destination;
        if (!pathIsEqual(context.downloadLocation, destination)) {
          return MoveFileSetDateTask(
            context.downloadLocation,
            destination,
            { clobber: true, mkdirp: true },
            dfContentInfo.publishedDate
          );
        }
        return null;
      },
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
        return {
          dfContentInfo: context.dfContentInfo,
          mediaInfo: context.mediaInfo,
          downloadLocation: context.finalLocation!,
          size: downloadResult?.size,
          finalDownloadStatus: downloadResult?.finalStatus,
          attempts: steps[0].managedTask?.attempt,
          subtitles: subtitlesResult
            ? {
                service: subtitlesResult.service,
                language: subtitlesResult.language,
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
