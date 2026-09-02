import { DfContentInfo, LanguageCode, TaskProgress, asyncGetFirstMatch, logger } from "df-downloader-common";
import { SubtitleGenerator, GeneratedSubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { configService } from "../config/config.js";
import { TaskControllerTaskBuilder, TaskControls } from "../task-manager/task/task-controller-task.js";
import { CommandCancelledError } from "../utils/command.js";

const describeFailure = (serviceType: string, err: unknown) =>
  `${serviceType}: ${err instanceof Error ? err.message : String(err)}`;

/**
 * Builds the error the task actually fails with.
 *
 * Previously the generators' own errors were only logged, and the task threw
 * a flat "no subs found" - so the UI reported that subtitles failed while
 * the reason existed solely in the container log. The generator that failed
 * is nearly always the interesting part, so it belongs in the message that
 * gets stored against the task and shown in the details dialog.
 */
const summariseFailure = (filePath: string, generators: SubtitleGenerator[], failures: string[]) =>
  failures.length
    ? `Could not generate subs for ${filePath} - ${failures.join("; ")}`
    : `No subs found for ${filePath} using generators ${generators.map((g) => g.serviceType).join(", ")}`;

const getSubs = async (
  subtitleGenerator: SubtitleGenerator | SubtitleGenerator[],
  contentInfo: DfContentInfo,
  filePath: string,
  language: LanguageCode | string
) => {
  const generators = Array.isArray(subtitleGenerator) ? subtitleGenerator : [subtitleGenerator];
  const failures: string[] = [];
  const result = await asyncGetFirstMatch(generators, async (generator) => {
    logger.log("info", `Generating subs for ${filePath} using ${generator.serviceType}`);
    try {
      return await generator.getSubs(contentInfo, filePath, language);
    } catch (err) {
      logger.log("error", `Error getting subs for ${filePath} using ${generator.serviceType}: ${err}`);
      failures.push(describeFailure(generator.serviceType, err));
      return null;
    }
  });
  if (!result) {
    throw new Error(summariseFailure(filePath, generators, failures));
  }
  return result;
};

type SubtitlesTaskContext = {
  subtitleGenerators: SubtitleGenerator | SubtitleGenerator[];
  dfContentInfo: DfContentInfo;
  filePath: string;
  language: LanguageCode | string;
  currentSubtitleGenerator?: SubtitleGenerator;
  /**
   * Set once the task starts, so Stop has something to signal.
   *
   * Transcription runs a subprocess for minutes - an hour on a long Direct -
   * and before this there was no way to take one back. The queue behind it
   * simply waited.
   */
  abortController?: AbortController;
  /** Updated by the generator as it works - see SubtitleProgressReporter. */
  progress?: TaskProgress;
};

const subtitlesTaskControls: TaskControls<GeneratedSubtitleInfo, SubtitlesTaskContext> = {
  start: async (context: SubtitlesTaskContext) => {
    const { subtitleGenerators, dfContentInfo, filePath, language } = context;
    const generators = Array.isArray(subtitleGenerators) ? subtitleGenerators : [subtitleGenerators];
    const failures: string[] = [];
    const startedAt = Date.now();
    const abortController = new AbortController();
    context.abortController = abortController;
    const result = await asyncGetFirstMatch(generators, async (generator) => {
      context.currentSubtitleGenerator = generator;
      logger.log("info", `Generating subs for ${filePath} using ${generator.serviceType}`);
      try {
        return await generator.getSubs(
          dfContentInfo,
          filePath,
          language,
          (progress) => {
            context.progress = progress;
          },
          abortController.signal
        );
      } catch (err) {
        /*
         * A stop is not a generator failing.
         *
         * Swallowing it here would move on to the next generator and then
         * report "all generators failed" - so pressing Stop would look like
         * an error, and on a multi-generator setup would start the next one
         * rather than stopping anything.
         */
        if (err instanceof CommandCancelledError || abortController.signal.aborted) {
          throw err;
        }
        logger.log("error", `Error getting subs for ${filePath} using ${generator.serviceType}: ${err}`);
        failures.push(describeFailure(generator.serviceType, err));
        return null;
      }
    });
    if (!result) {
      throw new Error(summariseFailure(filePath, generators, failures));
    }
    // Which service actually produced them matters: several are tried in
    // priority order and the earlier ones can fail silently from the user's
    // point of view, so "subtitles appeared" alone does not say what ran.
    logger.log(
      "info",
      `Generated ${language} subs for ${filePath} using ${result.service} in ${Date.now() - startedAt}ms${
        failures.length ? ` (after ${failures.length} failed generator(s))` : ""
      }`
    );
    return {
      status: "success",
      result,
    };
  },
  getStatusMessage: ({ context }) => {
    // No generator is chosen until the task starts, so a queued one used to
    // read "using undefined". The state is dropped too: the UI renders it
    // beside this, which made a waiting task say "Idle: ... : idle".
    const generator = context.currentSubtitleGenerator?.serviceType;
    const file = context.filePath.split(/[\/]/).pop() ?? context.filePath;
    return generator
      ? `Generating ${context.language} subs for ${file} with ${generator}`
      : `Waiting to generate ${context.language} subs for ${file}`;
  },
  getStatus: (context) => ({ progress: context.progress }),
  /*
   * Stops the transcription subprocess.
   *
   * A no-op on a task that has not started, which is the state most of a
   * queued run is in - that case is handled by the pipeline dequeuing the
   * step instead, so both are covered but by different mechanisms. See
   * docs/TASKS_AND_PIPELINES.md.
   *
   * The generator's own cleanup removes the partial .srt and the extracted
   * WAV on the way out, because both sit in a finally rather than on the
   * success path.
   */
  cancel: async (context: SubtitlesTaskContext) => {
    context.abortController?.abort();
  },
};
export const SubtitlesTaskBuilder = TaskControllerTaskBuilder(subtitlesTaskControls, {
  taskType: "subtitles",
  idPrefix: "subtitles-",
});

// export const SubtitlesTaskBuilder = taskify(getSubs, {
//   taskType: "subtitles",
// });

export class SubtitlesTaskManager extends TaskManager {
  constructor(taskManagerOpts: TaskManagerOpts = {}) {
    super(taskManagerOpts);
    // Mirrors DownloadTaskManager - pick up concurrency changes without a
    // restart, since this is the setting most likely to need tuning to the
    // machine it's running on.
    configService.on("configUpdated:subtitles", (event) => {
      const maxConcurrent = event?.newValue?.maxConcurrent;
      if (maxConcurrent && maxConcurrent !== this.concurrentTasks) {
        this.concurrentTasks = maxConcurrent;
        this.log("info", `Updated subtitles task manager concurrent tasks to ${maxConcurrent}`);
      }
    });
  }
}
export type SubtitlesTask = ReturnType<typeof SubtitlesTaskBuilder>;

export const isSubtitlesTask = (task: any): task is SubtitlesTask => task.taskType === "subtitles";
