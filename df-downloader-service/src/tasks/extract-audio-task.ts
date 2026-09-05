import { DfContentInfo, TaskProgress, logger } from "df-downloader-common";
import { PreparedAudio, SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { TaskControllerTaskBuilder, TaskControls } from "../task-manager/task/task-controller-task.js";

/**
 * Pulls the audio out of a video, ahead of transcribing it.
 *
 * Its own task, and therefore its own pipeline step, for two reasons. On a
 * long video this is minutes of ffmpeg, and doing it inside the transcription
 * task meant holding the single local-models slot throughout - so a local
 * analysis waited behind work that never needed a model at all. And a phase
 * that takes minutes deserves to be a step you can see, rather than a caption
 * inside a row that claims to be transcribing.
 *
 * Only generators that work from a local file implement `prepareAudio`; for
 * anything else this is skipped and the generator prepares its own input.
 */
export type ExtractAudioTaskContext = {
  generator: SubtitleGenerator;
  dfContentInfo: DfContentInfo;
  filePath: string;
  abortController?: AbortController;
  progress?: TaskProgress;
};

const extractAudioTaskControls: TaskControls<PreparedAudio, ExtractAudioTaskContext> = {
  start: async (context: ExtractAudioTaskContext) => {
    const { generator, dfContentInfo, filePath } = context;
    if (!generator.prepareAudio) {
      throw new Error(`${generator.serviceType} does not extract audio`);
    }
    const abortController = new AbortController();
    context.abortController = abortController;
    const startedAt = Date.now();
    const prepared = await generator.prepareAudio(
      dfContentInfo,
      filePath,
      (progress) => {
        context.progress = progress;
      },
      abortController.signal
    );
    logger.log("info", `Extracted audio from ${filePath} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
    return { status: "success", result: prepared };
  },
  getStatusMessage: ({ context }) => {
    const file = context.filePath.split(/[\\/]/).pop() ?? context.filePath;
    return `Extracting audio from ${file}`;
  },
  getStatus: (context) => ({ progress: context.progress }),
  /*
   * ffmpeg runs for minutes on a long video, so this is worth having - and
   * unlike most task types it genuinely does something. A stop on a task that
   * has not started is still a no-op; the pipeline dequeues that case.
   */
  cancel: async (context: ExtractAudioTaskContext) => {
    context.abortController?.abort();
  },
};

export const ExtractAudioTaskBuilder = TaskControllerTaskBuilder(extractAudioTaskControls, {
  taskType: "extract-audio",
  idPrefix: "extract-audio-",
});

export type ExtractAudioTask = ReturnType<typeof ExtractAudioTaskBuilder>;
export const isExtractAudioTask = (task: any): task is ExtractAudioTask => task.taskType === "extract-audio";
