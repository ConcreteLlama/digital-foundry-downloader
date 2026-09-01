import { AiAnalysisSourceSelection } from "df-downloader-common";
import { AiAnalysisResult, DfContentEntry, DfContentInfo, logger, makeErrorMessage } from "df-downloader-common";
import { AiAnalysisConfig, AiProviderId } from "df-downloader-common/config/ai-analysis-config.js";
import { TaskManager } from "../task-manager/task-manager.js";
import { taskify } from "../task-manager/utils.js";
import { TaskPipelineExecution, makeTaskPipeline } from "../task-manager/task-pipeline.js";
import { AiAnalysisTaskBuilder, AiAnalysisTaskManager } from "../tasks/ai-analysis-task.js";
import { Chapter } from "../utils/chatpers.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";

/**
 * Persists a finished analysis and applies any tags it is allowed to apply.
 *
 * A separate pipeline step rather than a completion callback so it shows
 * up in the task UI as its own thing and is retried on its own terms - a
 * successful (paid-for) analysis that failed only to write to disk should
 * not require paying for the analysis again.
 */
const saveAnalysis = async (
  db: DfDownloaderOperationalDb,
  entry: DfContentEntry,
  result: AiAnalysisResult,
  autoApplyTags: boolean
): Promise<AiAnalysisResult> => {
  await db.setAiAnalysis(entry.key, result);

  if (autoApplyTags) {
    const accepted = result.tags.filter((tag) => tag.status === "accepted").map((tag) => tag.tag);
    if (accepted.length) {
      const existing = entry.contentInfo.tags ?? [];
      // Case-insensitive union against what is already there: the model
      // does not know the user's existing tags, so it will happily
      // re-propose "PC Performance" for content already tagged "PC
      // performance", and two casings of one tag split a filter in half.
      const existingLower = new Set(existing.map((tag) => tag.toLowerCase()));
      const additions = accepted.filter((tag) => !existingLower.has(tag.toLowerCase()));
      if (additions.length) {
        await db.setContentInfos([{ ...entry.contentInfo, tags: [...existing, ...additions] }]);
        logger.log("info", `Applied ${additions.length} AI tags to ${entry.key}`);
      }
    }
  }
  return result;
};

const SaveAnalysisTask = taskify(saveAnalysis, {
  taskType: "inject_metadata",
  idPrefix: "save-analysis",
});

type AiAnalysisTaskPipelineCreatorOpts = {
  aiAnalysisTaskManager: AiAnalysisTaskManager;
  /** Small, ordered bookkeeping work - reuses the maintenance manager. */
  storageTaskManager: TaskManager;
  db: DfDownloaderOperationalDb;
};

export const createAiAnalysisTaskPipeline = (opts: AiAnalysisTaskPipelineCreatorOpts) => {
  const { aiAnalysisTaskManager, storageTaskManager, db } = opts;
  return makeTaskPipeline<
    {
      /**
       * Duplicated from `entry.contentInfo` deliberately: DfTaskManager
       * identifies which content a running pipeline belongs to by reading
       * `context.dfContentInfo.key`, uniformly across every pipeline type.
       * Carrying the full entry as well is what lets the analysis resolve
       * a transcript, which needs the downloads.
       */
      dfContentInfo: DfContentInfo;
      entry: DfContentEntry;
      config: AiAnalysisConfig;
      chapters?: Chapter[];
      articleText?: string;
      articleUrl?: string;
      articleTitle?: string;
      sources?: AiAnalysisSourceSelection;
      provider?: AiProviderId;
      allowRemoteChapters?: boolean;
      /** Set when a bulk run queued this - see TaskPipelineDetails.backfillJobId. */
      backfillJobId?: string;
      /** Re-analyse even if there is already a result - checked when the task runs. */
      force?: boolean;
    },
    "ai_analysis"
  >("ai_analysis")
    .next({
      stepName: "Analyse Content",
      taskCreator: ({ context }) =>
        AiAnalysisTaskBuilder({
          entry: context.entry,
          config: context.config,
          chapters: context.chapters,
          articleText: context.articleText,
          articleUrl: context.articleUrl,
          articleTitle: context.articleTitle,
          sources: context.sources,
          provider: context.provider,
          allowRemoteChapters: context.allowRemoteChapters,
          force: context.force,
        }),
      taskManager: aiAnalysisTaskManager,
    })
    .next({
      stepName: "Save Analysis",
      taskCreator: ({ context, previousTaskResult }) => {
        if (!previousTaskResult) {
          return null;
        }
        return SaveAnalysisTask(
          db,
          context.entry,
          previousTaskResult,
          context.config.features.tagging.enabled && context.config.features.tagging.applyMode === "auto_apply"
        );
      },
      taskManager: storageTaskManager,
    })
    .build({
      generateStatusMessage: ({ steps }) => {
        const lastResult = steps[steps.length - 1]?.managedTask?.task?.result;
        if (lastResult?.status === "success") {
          const analysis = steps[0].managedTask?.task?.result;
          if (analysis?.status === "success") {
            const cost = analysis.result.usage?.costUsd;
            const costText = cost ? ` (${formatCost(cost)})` : "";
            return `Analysed as ${analysis.result.contentType.replace(/_/g, " ")}${costText}`;
          }
        } else if (lastResult?.status === "failed") {
          return `Analysis failed: ${makeErrorMessage(lastResult.error)}`;
        }
      },
      reduceResults: ({ results }) => {
        const [analysisResult] = results;
        return analysisResult?.status === "success" ? (analysisResult.result as AiAnalysisResult) : undefined;
      },
    });
};

/**
 * Sub-cent costs are the normal case, and "$0.01" for everything from a
 * tags-only run to a full Direct analysis tells the user nothing.
 */
const formatCost = (costUsd: number): string =>
  costUsd < 0.01 ? `<$0.01` : `$${costUsd.toFixed(2)}`;

export type AiAnalysisTaskPipeline = ReturnType<typeof createAiAnalysisTaskPipeline>;
export type AiAnalysisTaskPipelineExecution = ReturnType<AiAnalysisTaskPipeline["start"]>;

export const isAiAnalysisTaskPipelineExecution = (
  execution: TaskPipelineExecution<any, any, any, any>
): execution is AiAnalysisTaskPipelineExecution => execution.pipelineType === "ai_analysis";
