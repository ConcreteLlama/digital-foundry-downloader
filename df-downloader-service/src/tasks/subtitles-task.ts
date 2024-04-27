import { DfContentInfo, LanguageCode, asyncGetFirstMatch, logger } from "df-downloader-common";
import { SubtitleGenerator, SubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { TaskControllerTaskBuilder, TaskControls } from "../task-manager/task/task-controller-task.js";

const getSubs = async (
  subtitleGenerator: SubtitleGenerator | SubtitleGenerator[],
  contentInfo: DfContentInfo,
  filePath: string,
  language: LanguageCode
) => {
  const generators = Array.isArray(subtitleGenerator) ? subtitleGenerator : [subtitleGenerator];
  const result = await asyncGetFirstMatch(generators, async (generator) => {
    logger.log("info", `Getting subs for ${filePath} using ${generator.serviceType}`);
    try {
      return await generator.getSubs(contentInfo, filePath, language);
    } catch (err) {
      logger.log("error", `Error getting subs for ${filePath} using ${generator.serviceType}: ${err}`);
      return null;
    }
  });
  if (!result) {
    throw new Error(
      `No subs found for ${filePath} using generators ${generators.map((g) => g.serviceType).join(", ")}`
    );
  }
  return result;
};

type SubtitlesTaskContext = {
  subtitleGenerators: SubtitleGenerator | SubtitleGenerator[];
  dfContentInfo: DfContentInfo;
  filePath: string;
  language: LanguageCode;
  currentSubtitleGenerator?: SubtitleGenerator;
};

const subtitlesTaskControls: TaskControls<SubtitleInfo, SubtitlesTaskContext> = {
  start: async (context: SubtitlesTaskContext) => {
    const { subtitleGenerators, dfContentInfo, filePath, language } = context;
    const generators = Array.isArray(subtitleGenerators) ? subtitleGenerators : [subtitleGenerators];
    const result = await asyncGetFirstMatch(generators, async (generator) => {
      context.currentSubtitleGenerator = generator;
      logger.log("info", `Getting subs for ${filePath} using ${generator.serviceType}`);
      try {
        return await generator.getSubs(dfContentInfo, filePath, language);
      } catch (err) {
        logger.log("error", `Error getting subs for ${filePath} using ${generator.serviceType}: ${err}`);
        return null;
      }
    });
    if (!result) {
      throw new Error(
        `No subs found for ${filePath} using generators ${generators.map((g) => g.serviceType).join(", ")}`
      );
    }
    return {
      status: "success",
      result,
    };
  },
  getStatusMessage: ({ context, state }) => {
    return `Getting ${context.language} subs for ${context.filePath} using ${context.currentSubtitleGenerator?.serviceType}: ${state}`;
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
  }
}
export type SubtitlesTask = ReturnType<typeof SubtitlesTaskBuilder>;

export const isSubtitlesTask = (task: any): task is SubtitlesTask => task.taskType === "subtitles";
