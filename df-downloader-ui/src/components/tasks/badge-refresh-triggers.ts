import { fetchContentBadges } from "../../store/df-content/df-content.action.ts";
import { TaskEvent, taskEvents } from "../../store/df-tasks/task-events.ts";
import { store } from "../../store/store.ts";

/**
 * Keeps the library's analysed/article badges honest while the app is open.
 *
 * Nothing else invalidates them: the content list is fetched on demand, and an
 * analysis finishing changes no entry - only what this installation now knows
 * about one - so no entry refetch would notice either. Without this the badge
 * appears on the next reload, which is exactly the bug this fixes.
 *
 * Both pipeline types, because analysis is a step inside the download pipeline
 * as well as a pipeline of its own, so a finished download can be the thing
 * that produced the analysis.
 */
const BADGE_CHANGING_PIPELINES = new Set(["ai_analysis", "download"]);

/**
 * Coalesces a burst into one request.
 *
 * A backfill finishes tasks in a run, and one request per completion would be
 * a request per item for a map the service builds in a single pass anyway.
 */
const PENDING_DELAY_MS = 400;
let pendingKeys = new Set<string>();
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const flush = () => {
  pendingTimer = null;
  const keys = [...pendingKeys];
  pendingKeys = new Set();
  if (keys.length) {
    store.dispatch(fetchContentBadges.start(keys));
  }
};

const registerBadgeRefreshTriggers = () => {
  const handleTaskCompleted = ({ task, firstFetch }: TaskEvent) => {
    // The first fetch is the existing state of the world, not news - every
    // completed task in the backlog would otherwise fire on page load.
    if (firstFetch || task.type !== "pipeline" || !BADGE_CHANGING_PIPELINES.has(task.pipelineType)) {
      return;
    }
    const key = task.pipelineDetails?.dfContent?.key;
    if (!key) {
      return;
    }
    pendingKeys.add(key);
    if (!pendingTimer) {
      pendingTimer = setTimeout(flush, PENDING_DELAY_MS);
    }
  };

  taskEvents.on("taskCompleted", handleTaskCompleted);

  return () => {
    taskEvents.off("taskCompleted", handleTaskCompleted);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    pendingKeys = new Set();
  };
};

export default registerBadgeRefreshTriggers;
