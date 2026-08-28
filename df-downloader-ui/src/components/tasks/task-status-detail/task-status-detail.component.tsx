import { Box } from "@mui/material";
import { TaskStatus } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectBasicTaskField,
  selectCurrentStep,
  selectDownoadingProgressField,
  selectIsComplete,
  selectTaskState,
} from "../../../store/df-tasks/tasks.selector.ts";
import { PipelineTrack } from "../pipeline-track/pipeline-track.component.tsx";
import { StepStatusDescription } from "../pipeline-track/step-status-description.component.tsx";
import { TaskReadout } from "../pipeline-track/task-readout.component.tsx";
import { CompletedTaskStatusDetail } from "./completed-task-status-detail.component.tsx";
import { TaskControls } from "../task-controls.component.tsx";

/**
 * A running pipeline: the segmented track, then its figures.
 *
 * Downloads and everything else share one presentation now. They used to
 * diverge - downloads had a gradient-backed grid of stats, everything else got
 * the stepper and maybe a bar - which meant the same pipeline looked like two
 * different things depending on which step it happened to be on.
 */
export const TaskStatusDetail = ({ pipelineId }: { pipelineId: string }) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId)) ?? "";
  const isComplete = useSelector(selectIsComplete(pipelineId));
  const downloadPercent = useSelector(selectDownoadingProgressField(pipelineId, currentStep, "percentComplete"));
  const status = useSelector(selectBasicTaskField<"status", TaskStatus | null>(pipelineId, currentStep, "status"));
  const taskState = useSelector(selectTaskState(pipelineId, currentStep));
  const activePercent = typeof downloadPercent === "number" ? downloadPercent : status?.progress?.percent;
  // TaskReadout renders nothing without a progress object, so anything that is
  // not actively transferring needs words instead - otherwise the card is a
  // title, an empty track and two buttons.
  const isRunning = taskState === "running";

  if (isComplete) {
    return <CompletedTaskStatusDetail pipelineId={pipelineId} />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <PipelineTrack pipelineId={pipelineId} activePercent={activePercent} />
        </Box>
        {/* The whole card opens the details dialog; pause/resume/cancel must
            not also do that. Stopped here rather than at each call site so
            every consumer of TaskStatusDetail is covered. */}
        <Box onClick={(event) => event.stopPropagation()} sx={{ flexShrink: 0 }}>
          <TaskControls pipelineId={pipelineId} />
        </Box>
      </Box>
      {isRunning ? (
        <TaskReadout pipelineId={pipelineId} />
      ) : (
        <StepStatusDescription pipelineId={pipelineId} stepId={currentStep} />
      )}
    </Box>
  );
};
