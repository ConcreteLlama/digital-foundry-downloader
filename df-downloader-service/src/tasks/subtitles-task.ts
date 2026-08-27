import { DfContentInfo, LanguageCode, TaskProgress, asyncGetFirstMatch, logger } from "df-downloader-common";
import { SubtitleGenerator, GeneratedSubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { configService } from "../config/config.js";
import { TaskControllerTaskBuilder, TaskControls } from "../task-manager/task/task-controller-task.js";

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
  /** Updated by the generator as it works - see SubtitleProgressReporter. */
  progress?: TaskProgress;
};

const subtitlesTaskControls: TaskControls<GeneratedSubtitleInfo, SubtitlesTaskContext> = {
  start: async (context: SubtitlesTaskContext) => {
    const { subtitleGenerators, dfContentInfo, filePath, language } = context;
    const generators = Array.isArray(subtitleGenerators) ? subtitleGenerators : [subtitleGenerators];
    const failures: string[] = [];
    const result = await asyncGetFirstMatch(generators, async (generator) => {
      context.currentSubtitleGenerator = generator;
      logger.log("info", `Generating subs for ${filePath} using ${generator.serviceType}`);
      try {
        return await generator.getSubs(dfContentInfo, filePath, language, (progress) => {
          context.progress = progress;
        });
      } catch (err) {
        logger.log("error", `Error getting subs for ${filePath} using ${generator.serviceType}: ${err}`);
        failures.push(describeFailure(generator.serviceType, err));
        return null;
      }
    });
    if (!result) {
      throw new Error(summariseFailure(filePath, generators, failures));
    }
    return {
      status: "success",
      result,
    };
  },
  getStatusMessage: ({ context, state }) => {
    return `Generating ${context.language} subs for ${context.filePath} using ${context.currentSubtitleGenerator?.serviceType}: ${state}`;
  },
  getStatus: (context) => ({ progress: context.progress }),
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
