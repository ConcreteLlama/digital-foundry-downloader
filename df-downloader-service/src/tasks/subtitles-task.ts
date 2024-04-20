import { DfContentInfo, LanguageCode, asyncGetFirstMatch, logger } from "df-downloader-common";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { taskify } from "../task-manager/utils.js";

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

export const SubtitlesTaskBuilder = taskify(getSubs, {
  taskType: "subtitles",
});

export class SubtitlesTaskManager extends TaskManager {
  constructor(taskManagerOpts: TaskManagerOpts = {}) {
    super(taskManagerOpts);
  }
}
export type SubtitlesTask = ReturnType<typeof SubtitlesTaskBuilder>;

export const isSubtitlesTask = (task: any): task is SubtitlesTask => task.taskType === "subtitles";
