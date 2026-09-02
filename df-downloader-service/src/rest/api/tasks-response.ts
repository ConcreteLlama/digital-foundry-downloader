import { TasksResponse, mapFilterEmpty } from "df-downloader-common";
import { DigitalFoundryContentManager } from "../../df-content-manager.js";
import { makeTaskPipelineInfoFromPersisted } from "../../df-task-manager.js";
import { serviceLocator } from "../../services/service-locator.js";

/**
 * How many finished pipelines from previous runs to include.
 *
 * The full history is capped far higher on disk, but this response goes out
 * on every change, and each entry carries its content info - returning
 * hundreds would mean megabytes per update for history nobody is scrolling
 * that far back through.
 */
const HISTORY_LIMIT = 50;

/**
 * Builds the body shared by GET /tasks/list and the realtime stream's `tasks`
 * channel.
 *
 * The stream pushes this same full snapshot on every change rather than a
 * delta - the UI's reducer treats each payload as a full replacement (it drops
 * any pipeline missing from it), and the list is small enough that diffing
 * would buy complexity rather than bandwidth.
 */
export const makeBuildTasksResponse =
  (contentManager: DigitalFoundryContentManager) => async (): Promise<TasksResponse> => {
    const taskManager = contentManager.taskManager;
    const taskPipelines = taskManager.getAllPipelineInfos();
    const tasks = taskManager.getAllTaskInfos();
    // Finished pipelines only live in memory, so a restart used to empty the
    // completed list entirely. Top them up from the persisted history,
    // skipping any the running process already knows about.
    const liveIds = new Set(taskPipelines.map((pipeline) => pipeline.id));
    const history = (serviceLocator.completedPipelineDb?.getAll() || [])
      .filter((record) => !liveIds.has(record.id))
      .slice(0, HISTORY_LIMIT);
    let historyPipelines: typeof taskPipelines = [];
    if (history.length) {
      const contentEntries = await contentManager.db.getContentEntryMap(history.map((record) => record.contentKey));
      historyPipelines = mapFilterEmpty(history, (record) => {
        const contentInfo = contentEntries.get(record.contentKey)?.contentInfo;
        // Content deleted since the run happened - there's nothing sensible
        // to show for it, so leave it out rather than inventing a title.
        return contentInfo ? makeTaskPipelineInfoFromPersisted(record, contentInfo) : undefined;
      });
    }
    return {
      taskPipelines: [...taskPipelines, ...historyPipelines],
      tasks: tasks,
      scheduledDownloads: contentManager.getScheduledDownloads(),
      taskManagers: taskManager.getManagerStatuses(),
      localCompute: taskManager.getLocalComputeStatus(),
    };
  };
