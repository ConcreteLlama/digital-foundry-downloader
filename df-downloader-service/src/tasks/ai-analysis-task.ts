import { SrtLine } from "df-downloader-common";
import { AiAnalysisResult, DfContentEntry, logger } from "df-downloader-common";
import { AiAnalysisConfig } from "df-downloader-common/config/ai-analysis-config.js";
import { configService } from "../config/config.js";
import { TaskControllerTaskBuilder, TaskControls } from "../task-manager/task/task-controller-task.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { Chapter } from "../utils/chatpers.js";
import { analyseContent } from "../utils/ai/analyse.js";
import { serviceLocator } from "../services/service-locator.js";

type AiAnalysisTaskContext = {
  entry: DfContentEntry;
  config: AiAnalysisConfig;
  chapters?: Chapter[];
  articleText?: string;
  articleUrl?: string;
  articleTitle?: string;
  /** Supplied by the during-download path, where the transcript exists but the download is not filed yet. */
  transcriptText?: string;
  /** Cues, when the caller has them - see AnalysisInputs.transcriptLines. */
  transcriptLines?: SrtLine[];
  /** Set as the run progresses, purely so the UI can say what it is doing. */
  stage?: string;
  /**
   * Re-analyse even if there is already a result.
   *
   * Read at the moment the task runs rather than when it was queued, which is
   * the whole point of it being here - see the check in start().
   */
  force?: boolean;
};

const aiAnalysisTaskControls: TaskControls<AiAnalysisResult, AiAnalysisTaskContext> = {
  start: async (context: AiAnalysisTaskContext) => {
    const { entry, config, chapters, articleText, articleUrl, articleTitle, transcriptText, transcriptLines } = context;
    /*
     * Checked here, immediately before spending money, rather than when this
     * was queued.
     *
     * A bulk run queues every item at once so they are all visible, which
     * means an item can sit in the queue for a long time - long enough for an
     * automatic run after a download, or someone pressing analyse by hand, to
     * have already done it. The check at queue time cannot see that, and the
     * cost of getting it wrong is a second charge for an identical result.
     *
     * Returns what is already stored rather than inventing a skipped outcome:
     * it is true, it costs nothing, and it cannot quietly leave the caller
     * with no analysis at all.
     */
    if (!context.force) {
      const existing = await serviceLocator.db.getAiAnalysis(entry.contentInfo.key);
      if (existing && !existing.error) {
        logger.log(
          "info",
          `Skipping analysis of ${entry.key} - it already has a result and this run did not ask to replace it`
        );
        context.stage = "Already analysed";
        return { status: "success", result: existing };
      }
    }
    context.stage = "Analysing";
    logger.log("info", `Analysing ${entry.key} with ${config.model}`);
    const result = await analyseContent(config, { entry, chapters, articleText, articleUrl, articleTitle, transcriptText, transcriptLines });
    // analyseContent reports an ordinary failure inside the result rather
    // than throwing, so the task has to promote it - otherwise a run that
    // failed would be recorded as a successful task holding an error.
    if (result.error) {
      throw new Error(result.error);
    }
    context.stage = "Complete";
    return { status: "success", result };
  },
  getStatusMessage: ({ context, state }) =>
    `Analysing "${context.entry.contentInfo.title}" with ${context.config.model}: ${context.stage ?? state}`,
};

export const AiAnalysisTaskBuilder = TaskControllerTaskBuilder(aiAnalysisTaskControls, {
  taskType: "ai_analysis",
  idPrefix: "ai-analysis-",
});
export type AiAnalysisTask = ReturnType<typeof AiAnalysisTaskBuilder>;

export const isAiAnalysisTask = (task: any): task is AiAnalysisTask => task.taskType === "ai_analysis";

/**
 * Concurrency for analysis runs.
 *
 * Defaults to 2 rather than 1: unlike local transcription this is a remote
 * API call, so the work happens elsewhere and running a couple at once
 * costs this machine nothing. Kept low all the same - each run is two
 * billable calls, and a runaway parallel sweep across a 3000-item library
 * is exactly the kind of thing that should not be easy to start by
 * accident.
 */
const DEFAULT_CONCURRENT_ANALYSES = 2;

export class AiAnalysisTaskManager extends TaskManager {
  constructor(taskManagerOpts: TaskManagerOpts = {}) {
    super({ concurrentTasks: DEFAULT_CONCURRENT_ANALYSES, ...taskManagerOpts });
    configService.on("configUpdated:aiAnalysis", () => {
      // Nothing to re-read today - concurrency is not user-configurable
      // for this task, deliberately, since the sensible range is narrow
      // and the cost of getting it wrong is money rather than a slow box.
    });
  }
}
