import { DfContentEntry, TaskStatus } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectActivePipelineIdsForContent,
  selectBasicTaskField,
  selectCurrentStep,
  selectDownoadingProgressField,
} from "../../../store/df-tasks/tasks.selector";
import { ContentRowState, getRestingRowState } from "./content-row-state";

export type ContentRowStatus = {
  state: ContentRowState;
  /** 0-100 while something is running, otherwise undefined. */
  percent?: number;
  /** Short line under the state chip - formats held, or what's running. */
  detail?: string;
  activePipelineId?: string;
  /** Pipelines beyond the one being described, shown as "+N". */
  extraCount?: number;
};

/**
 * Resolves what a library row should say.
 *
 * Hooks can't be called conditionally, so both the download-progress and the
 * generic-step-progress selectors run every render and the right one is
 * chosen afterwards. They're cheap - each is a memoised lookup into the task
 * map - and the alternative is branching hook calls.
 */
export const useContentRowStatus = (entry?: DfContentEntry): ContentRowStatus => {
  const pipelineIds = useSelector(selectActivePipelineIdsForContent(entry?.key ?? ""));
  // One row, one state. An item can legitimately have a download and a
  // subtitle job running at once; the row describes the first and appends
  // "+N" so the others are at least visible, and the Activity page shows each
  // pipeline in full. Picking the download deliberately: it is the one with a
  // meaningful percentage, and the one whose failure matters most.
  const activePipelineId = pipelineIds[0];
  const extraCount = pipelineIds.length > 1 ? pipelineIds.length - 1 : undefined;
  const currentStep = useSelector(selectCurrentStep(activePipelineId ?? "")) ?? "";
  const taskType = useSelector(selectBasicTaskField(activePipelineId ?? "", currentStep, "taskType"));
  const downloadPercent = useSelector(
    selectDownoadingProgressField(activePipelineId ?? "", currentStep, "percentComplete")
  );
  const stepStatus = useSelector(
    selectBasicTaskField<"status", TaskStatus | null>(activePipelineId ?? "", currentStep, "status")
  );

  if (activePipelineId) {
    const isDownload = taskType === "download";
    const percent = isDownload ? downloadPercent : stepStatus?.progress?.percent;
    return {
      state: isDownload ? "downloading" : "working",
      percent: typeof percent === "number" ? percent : undefined,
      detail: isDownload
        ? typeof downloadPercent === "number"
          ? `${downloadPercent.toFixed(1)}%`
          : undefined
        : stepStatus?.progress?.detail ?? (taskType ? String(taskType) : undefined),
      activePipelineId,
      extraCount,
    };
  }

  if (!entry) {
    return { state: "unknown" };
  }
  const state = getRestingRowState(entry);
  return {
    state,
    detail:
      state === "downloaded"
        ? entry.downloads.map((d) => d.mediaInfo.formatString).join(" · ")
        : state === "needs-refresh"
        ? "Link predates the site migration"
        : state === "paywalled"
        ? "Not in your tier"
        : undefined,
  };
};
