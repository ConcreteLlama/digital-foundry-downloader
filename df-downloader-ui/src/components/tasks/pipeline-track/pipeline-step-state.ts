import { TaskInfo, TaskPipelineInfo, TaskState } from "df-downloader-common";

/**
 * What a pipeline step is doing, as one derivation shared by every view.
 *
 * There used to be two. The card's track derived state positionally
 * (`index < currentIndex ? skipped : pending`) and got it right; the details
 * dialog derived it from the task object alone (`state ?? (task ? "pending" :
 * "skipped")`) and, because a step that has not been instantiated yet has no
 * task, labelled every FUTURE step "skipped". The same pipeline reported
 * different things depending on where you looked at it.
 *
 * The two views now differ only in which states they filter out - see
 * isHiddenOnTrack. Adding a third derivation to achieve a presentation
 * difference is what caused this in the first place.
 */
export type PipelineStepVisualState =
  | "done"
  | "carried_over"
  | "running"
  | "paused"
  | "failed"
  | "cancelled"
  | "skipped"
  | "not_applicable"
  | "pending";

export type PipelineStepView = {
  stepId: string;
  name: string;
  state: PipelineStepVisualState;
  /** Why it will not run, for not_applicable. Shown as a tooltip. */
  reason?: string;
  task?: TaskInfo;
  isCurrent: boolean;
};

const fromTaskState = (taskState: TaskState): PipelineStepVisualState | undefined => {
  switch (taskState) {
    case "success":
      return "done";
    case "running":
    case "pausing":
      return "running";
    case "paused":
    case "awaiting_retry":
      return "paused";
    case "failed":
      return "failed";
    case "cancelled":
    case "cancelling":
      return "cancelled";
    default:
      return undefined;
  }
};

/**
 * `carriedOver` marks a step that completed in an earlier run and was
 * inherited when the pipeline resumed. Reporting it as "skipped" made a
 * resumed download claim it had skipped downloading, which is alarming and
 * untrue - the reasoning behind the original dialog handling, preserved here
 * now that both views share this.
 */
export const derivePipelineStepViews = (pipeline: TaskPipelineInfo): PipelineStepView[] => {
  const { pipelineDetails, pipelineStatus, stepTasks } = pipeline;
  const { stepOrder, steps } = pipelineDetails;
  const currentIndex = stepOrder.findIndex((stepId) => stepId === pipelineStatus.currentStep);

  return stepOrder.map((stepId, index) => {
    const task = stepTasks[stepId];
    const details = steps[stepId];
    const name = details?.name ?? stepId;
    const reason = details?.notApplicableReason;
    const base = { stepId, name, task, isCurrent: stepId === pipelineStatus.currentStep };

    if (task?.carriedOver) {
      return { ...base, state: "carried_over" as const };
    }
    const fromState = task?.status?.state ? fromTaskState(task.status.state) : undefined;
    if (fromState) {
      return { ...base, state: fromState };
    }
    // No terminal state of its own. Position decides: a step the pipeline has
    // already moved past did not run, one it has not reached yet still might.
    const isBeforeCurrent = currentIndex >= 0 && index < currentIndex;
    if (isBeforeCurrent) {
      return { ...base, state: "skipped" as const, reason };
    }
    if (reason) {
      return { ...base, state: "not_applicable" as const, reason };
    }
    return { ...base, state: "pending" as const };
  });
};

/**
 * The card's track hides steps that were never going to run - it is a glance,
 * not an inventory. The dialog shows them, dimmed, with the reason.
 *
 * Defensive on purpose: a step is hidden only if it is not_applicable AND has
 * never started. If something predicted dead runs anyway, the prediction was
 * wrong and the work must be visible - a bad guess should surface as an
 * unexpected segment, never as silent work.
 */
export const isHiddenOnTrack = (view: PipelineStepView) =>
  view.state === "not_applicable" && !view.task;
