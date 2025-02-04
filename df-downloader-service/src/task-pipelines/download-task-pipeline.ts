import { DfContentInfo, MediaInfo, makeErrorMessage } from "df-downloader-common";
import { configService } from "../config/config.js";
import { makeMediaMeta } from "../df-mpeg-meta.js";
import { DownloadUrlOpt } from "../download/download-url.js";
import { serviceLocator } from "../services/service-locator.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { DownloadTask, DownloadTaskManager } from "../tasks/download-task.js";
import { MetadataTask } from "../tasks/metadata-task.js";
import { MoveFileSetDateTask } from "../tasks/move-file-set-date-task.js";
import { SubtitlesTaskBuilder, SubtitlesTaskManager } from "../tasks/subtitles-task.js";
import { makeFilePathWithTemplate } from "../utils/template-utils.js";

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
    .next({
      stepName: "Fetch Subtitles",
      taskCreator: ({ context, previousTaskResult }) => {
        const { dfContentInfo, downloadLocation } = context;
        const config = configService.config;
        const subtitlesConfig = config.subtitles;
        if (subtitlesConfig?.autoGenerateSubs) {
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
      stepName: "Inject Metadata",
      taskCreator: ({ context, previousTaskResult: subtitleInfo, allResults }) => {
        const { dfContentInfo, downloadLocation } = context;
        const config = configService.config;
        const metaConfig = config.metadata;
        const metaForInjection = metaConfig.injectMetadata ? dfContentInfo : undefined;
        if (metaForInjection || subtitleInfo) {
          return MetadataTask(downloadLocation, makeMediaMeta(metaForInjection, subtitleInfo));
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
        if (context.downloadLocation !== destination) {
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
        const [downloadTaskResult, subtitlesTaskResult] = results;
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
