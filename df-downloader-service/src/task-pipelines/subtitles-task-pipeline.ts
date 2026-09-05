import { DfContentInfo, LanguageCode, MediaInfo, makeErrorMessage } from "df-downloader-common";
import { makeMediaFileMeta } from "../df-mpeg-meta.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { InjectMetadataTask } from "../tasks/inject-metadata-task.js";
import { WriteSubtitlesSidecarTask } from "../tasks/write-subtitles-sidecar-task.js";
import { resolveSubtitlesOutput } from "../media-utils/subtitles/sidecar.js";
import { configService } from "../config/config.js";
import { ExtractAudioTaskBuilder } from "../tasks/extract-audio-task.js";
import { SubtitlesTaskBuilder } from "../tasks/subtitles-task.js";
import { LocalModelsTaskManager } from "../tasks/local-models-task-manager.js";

type SubtitlesTaskPipelineCreatorOpts = {
  localModelsTaskManager: LocalModelsTaskManager;
  /** Whole-file reads/writes (remux) - serialized, see df-task-manager.ts. */
  mediaProcessingTaskManager: TaskManager;
  /** Cheap filesystem work - where audio extraction belongs. */
  fileTaskManager: TaskManager;
};

/**
 * Step positions, named.
 *
 * The later steps read earlier ones by index, and inserting Extract Audio in
 * front of what used to be step 0 silently repointed every one of them at the
 * wrong result. Named so the next insertion is a compile error rather than a
 * subtitle file written from the wrong thing.
 */
const STEP = {
  extractAudio: 0,
  generateSubtitles: 1,
  injectMetadata: 2,
  writeSubtitles: 3,
} as const;

export const createSubtitlesTaskPipeline = (opts: SubtitlesTaskPipelineCreatorOpts) => {
  const { localModelsTaskManager, mediaProcessingTaskManager, fileTaskManager } = opts;
  return makeTaskPipeline<
    {
      dfContentInfo: DfContentInfo;
      mediaInfo: MediaInfo;
      fileLocation: string;
      language: LanguageCode | string;
      subtitleGenerators: SubtitleGenerator | SubtitleGenerator[];
      /** Set when a bulk run queued this - see TaskPipelineDetails.backfillJobId. */
      backfillJobId?: string;
    },
    "subtitles"
  >("subtitles")
    .next({
      /**
       * ffmpeg, on the filesystem queue rather than the local models one.
       *
       * On a long video this is minutes of work that needs no model, and
       * running it inside the transcription task held the single local-models
       * slot for all of it - so an analysis queued behind a transcription
       * waited through the extraction too. It also spent those minutes
       * displayed as a transcription that had not started.
       *
       * Skipped for a service that has nothing to prepare - one that uploads
       * the file or is handed a URL - and prepared only for the first
       * generator, since a fallback is a different service that prepares its
       * own input.
       */
      stepName: "Extract Audio",
      taskCreator: ({ context }) => {
        const { dfContentInfo, fileLocation, subtitleGenerators } = context;
        const [generator] = Array.isArray(subtitleGenerators) ? subtitleGenerators : [subtitleGenerators];
        if (!generator?.prepareAudio) {
          return null;
        }
        return ExtractAudioTaskBuilder({ generator, dfContentInfo, filePath: fileLocation });
      },
      taskManager: fileTaskManager,
    })
    .next({
      stepName: "Generate Subtitles",
      taskCreator: ({ context, previousTaskResult }) => {
        const { dfContentInfo: contentInfo, fileLocation, language, subtitleGenerators: subtitleGenerator } = context;
        return SubtitlesTaskBuilder({
          subtitleGenerators: subtitleGenerator,
          dfContentInfo: contentInfo,
          filePath: fileLocation,
          language,
          // Undefined when the step above was skipped, in which case the
          // generator extracts for itself exactly as it always did.
          preparedAudio: previousTaskResult,
        });
      },
      taskManager: localModelsTaskManager,
    })
    .next({
      stepName: "Inject Metadata",
      taskCreator: ({ context, previousTaskResult }) => {
        const { fileLocation } = context;
        // This pipeline always acts on a file that's already in place, so
        // "auto" resolves to a sidecar here - embedding would mean rewriting
        // a file the library has indexed and may be streaming.
        if (!resolveSubtitlesOutput(configService.config.subtitles?.output ?? "auto", "existing_file").embed) {
          return null;
        }
        return InjectMetadataTask(fileLocation, makeMediaFileMeta(undefined, previousTaskResult));
      },
      taskManager: mediaProcessingTaskManager,
    })
    .next({
      stepName: "Write Subtitles",
      taskCreator: ({ context, allResults }) => {
        const subtitlesTaskResult = allResults[STEP.generateSubtitles];
        const subtitles = subtitlesTaskResult?.status === "success" ? subtitlesTaskResult.result : null;
        const subtitlesConfig = configService.config.subtitles;
        if (
          !subtitles ||
          (!resolveSubtitlesOutput(subtitlesConfig?.output ?? "auto", "existing_file").sidecar &&
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
            const task = steps[STEP.generateSubtitles].managedTask?.task;
            if (task?.result?.status === "success") {
              const subTaskResult = task.result.result;
              // "Generated", not "fetched": whisper transcribes locally and
              // fetches nothing, and it is the default. The word was left over
              // from when every subtitle service was a remote API.
              return `Generated ${subTaskResult.language} subs with ${subTaskResult.service}`;
            }
          } else if (lastResult.status === "failed") {
            return `Failed to fetch or inject subtitles: ${makeErrorMessage(lastResult.error)}`;
          }
        }
      },
      reduceResults: ({ results, context }) => {
        const subtitlesTaskResult = results[STEP.generateSubtitles];
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
