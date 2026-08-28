import { DfContentInfo, LanguageCode, MediaInfo, makeErrorMessage } from "df-downloader-common";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { WriteSubtitlesSidecarTask } from "../tasks/write-subtitles-sidecar-task.js";
import { resolveSubtitlesOutput } from "../media-utils/subtitles/sidecar.js";
import { configService } from "../config/config.js";
import { SubtitlesTaskBuilder, SubtitlesTaskManager } from "../tasks/subtitles-task.js";

type SubtitlesTaskPipelineCreatorOpts = {
  subtitlesTaskManager: SubtitlesTaskManager;
  /** Whole-file reads/writes (remux) - serialized, see df-task-manager.ts. */
  mediaProcessingTaskManager: TaskManager;
};

export const createSubtitlesTaskPipeline = (opts: SubtitlesTaskPipelineCreatorOpts) => {
  const { subtitlesTaskManager, mediaProcessingTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      mediaInfo: MediaInfo;
      fileLocation: string;
      language: LanguageCode | string;
      subtitleGenerators: SubtitleGenerator | SubtitleGenerator[];
    },
    "subtitles"
  >("subtitles")
    .next({
      stepName: "Generate Subtitles",
      taskCreator: ({ context }) => {
        const { dfContentInfo: contentInfo, fileLocation, language, subtitleGenerators: subtitleGenerator } = context;
        return SubtitlesTaskBuilder({
          subtitleGenerators: subtitleGenerator,
          dfContentInfo: contentInfo,
          filePath: fileLocation,
          language,
        });
      },
      taskManager: subtitlesTaskManager,
    })
    .next({
      stepName: "Inject Metadata",
      taskCreator: ({ context, previousTaskResult }) => {
        const { fileLocation } = context;
        // This pipeline always acts on a file that's already in place, so
        // "auto" resolves to a sidecar here - embedding would mean rewriting
        // a file the library has indexed and may be streaming.
        if (resolveSubtitlesOutput(configService.config.subtitles?.output ?? "auto", "existing_file") !== "embed") {
          return null;
        }
        return InjectMetadataTask(fileLocation, makeMediaFileMeta(undefined, previousTaskResult));
      },
      taskManager: mediaProcessingTaskManager,
    })
    .next({
      stepName: "Write Subtitles",
      taskCreator: ({ context, allResults }) => {
        const [subtitlesTaskResult] = allResults;
        const subtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        const subtitlesConfig = configService.config.subtitles;
        if (
          !subtitles ||
          (resolveSubtitlesOutput(subtitlesConfig?.output ?? "auto", "existing_file") !== "sidecar" &&
            !subtitlesConfig?.keepTranscript)
        ) {
          return null;
        }
        return WriteSubtitlesSidecarTask(context.fileLocation, subtitles);
      },
      taskManager: mediaProcessingTaskManager,
    })
    .build({
      generateStatusMessage: ({ steps }) => {
        const lastResult = steps[steps.length - 1]?.managedTask?.task?.result;
        if (lastResult) {
          if (lastResult.status === "success") {
            const task = steps[0].managedTask?.task;
            if (task?.result?.status === "success") {
              const subTaskResult = task.result.result;
              return `Fetched ${subTaskResult.language} subs from ${subTaskResult.service}`;
            }
          } else if (lastResult.status === "failed") {
            return `Failed to fetch or inject subtitles: ${makeErrorMessage(lastResult.error)}`;
          }
        }
      },
      reduceResults: ({ results, context }) => {
        const [subtitlesTaskResult] = results;
        const subtitlesResult = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        // Where the sidecar landed, when one was written - previously discarded.
        const sidecarResult = results[results.length - 1];
        const subtitlePath =
          sidecarResult?.status === "success" && typeof sidecarResult.result === "string"
            ? sidecarResult.result
            : undefined;
        return {
          language: context.language,
          service: subtitlesResult!.service,
          path: subtitlePath,
        };
      },
    });
};
export type SubtitlesTaskPipeline = ReturnType<typeof createSubtitlesTaskPipeline>;
export type SubtitlesTaskPipelineExecution = ReturnType<SubtitlesTaskPipeline["start"]>;

export const isSubtitlesTaskPipelineExecution = (
  execution: TaskPipelineExecution<any, any, any, any>
): execution is SubtitlesTaskPipelineExecution => execution.pipelineType === "subtitles";
