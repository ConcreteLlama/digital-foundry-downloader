import { DfContentInfo, LanguageCode, MediaInfo, makeErrorMessage } from "df-downloader-common";
import { makeMediaMeta } from "../df-mpeg-meta.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { MetadataTask } from "../tasks/metadata-task.js";
import { SubtitlesTaskBuilder, SubtitlesTaskManager } from "../tasks/subtitles-task.js";

type SubtitlesTaskPipelineCreatorOpts = {
  subtitlesTaskManager: SubtitlesTaskManager;
  fileTaskManager: TaskManager;
};

export const createSubtitlesTaskPipeline = (opts: SubtitlesTaskPipelineCreatorOpts) => {
  const { subtitlesTaskManager, fileTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      mediaInfo: MediaInfo;
      fileLocation: string;
      language: LanguageCode;
      subtitleGenerators: SubtitleGenerator | SubtitleGenerator[];
    },
    "subtitles"
  >("subtitles")
    .next({
      stepName: "Fetch Subtitles",
      taskCreator: ({ context }) => {
        const { dfContentInfo, fileLocation, language, subtitleGenerators } = context;
        return SubtitlesTaskBuilder(subtitleGenerators, dfContentInfo, fileLocation, language);
      },
      taskManager: subtitlesTaskManager,
    })
    .next({
      stepName: "Inject Metadata",
      taskCreator: ({ context, previousTaskResult }) => {
        const { fileLocation } = context;
        return MetadataTask(fileLocation, makeMediaMeta(undefined, previousTaskResult));
      },
      taskManager: fileTaskManager,
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
        return {
          language: context.language,
          service: subtitlesResult!.service,
        };
      },
    });
};
export type SubtitlesTaskPipeline = ReturnType<typeof createSubtitlesTaskPipeline>;
export type SubtitlesTaskPipelineExecution = ReturnType<SubtitlesTaskPipeline["start"]>;

export const isSubtitlesTaskPipelineExecution = (
  execution: TaskPipelineExecution<any, any, any, any>
): execution is SubtitlesTaskPipelineExecution => execution.pipelineType === "subtitles";
