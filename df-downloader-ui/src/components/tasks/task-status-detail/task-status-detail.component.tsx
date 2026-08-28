import { Box } from "@mui/material";
import { TaskStatus } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectBasicTaskField,
  selectCurrentStep,
  selectDownoadingProgressField,
  selectIsComplete,
} from "../../../store/df-tasks/tasks.selector.ts";
import { PipelineTrack } from "../pipeline-track/pipeline-track.component.tsx";
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
  const activePercent = typeof downloadPercent === "number" ? downloadPercent : status?.progress?.percent;

  if (isComplete) {
    return <CompletedTaskStatusDetail pipelineId={pipelineId} />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <PipelineTrack pipelineId={pipelineId} activePercent={activePercent} />
        </Box>
        <TaskControls pipelineId={pipelineId} />
      </Box>
      <TaskReadout pipelineId={pipelineId} />
    </Box>
  );
};
