import { Stack, Typography } from "@mui/material";
import { TaskStatus, estimateProgressTimeRemainingMs } from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectBasicTaskField, selectCurrentStep, selectIsComplete } from "../../../store/df-tasks/tasks.selector.ts";
import prettyMilliseconds from "pretty-ms";
import { LinearProgressWithLabel } from "../../general/linear-progress-with-label.component.tsx";
import { TaskPipelineStepper } from "../progress-stepper/task-pipeline-stepper.component.tsx";
import { CompletedTaskStatusDetail } from "./completed-task-status-detail.component.tsx";
import { DownloadTaskStatusDetail } from "./download-task-status-detail.component.tsx";

/**
 * Anything that isn't a download: the pipeline stepper, plus a progress bar
 * for steps that can report one.
 *
 * Downloads have always had their own detailed progress (speed, ETA, bytes).
 * Everything else used to show the stepper alone, which for the long steps -
 * transcribing a two-hour episode takes tens of minutes - meant no indication
 * of whether anything was happening at all. Steps that can't report progress
 * are unchanged and simply show the stepper.
 */
const OtherTaskStatusDetail = ({ pipelineId, stepId }: { pipelineId: string; stepId: string }) => {
  const status = useSelector(selectBasicTaskField<"status", TaskStatus | null>(pipelineId, stepId, "status"));
  const startTime = useSelector(selectBasicTaskField<"startTime", Date | undefined>(pipelineId, stepId, "startTime"));
  const progress = status?.progress;
  // Downloads show an ETA from their byte rate; these steps had a bar and no
  // sense of how much longer it represented, which for a transcription is the
  // question actually being asked.
  const remainingMs = estimateProgressTimeRemainingMs(startTime, progress);
  return (
    <Stack sx={{ width: "100%" }} spacing={0.5}>
      <TaskPipelineStepper pipelineId={pipelineId} />
      {progress && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
          <LinearProgressWithLabel value={progress.percent} />
          {progress.detail && (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              {progress.detail}
            </Typography>
          )}
          {remainingMs !== undefined && (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              ETA: {prettyMilliseconds(remainingMs, { secondsDecimalDigits: 0, unitCount: 2 })}
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
};

export const TaskStatusDetail = ({ pipelineId }: { pipelineId: string }) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const taskType = useSelector(selectBasicTaskField(pipelineId, currentStep || "", "taskType"));
  const isComplete = useSelector(selectIsComplete(pipelineId));
  return isComplete ? (
    <CompletedTaskStatusDetail pipelineId={pipelineId} />
  ) : taskType === "download" ? (
    <DownloadTaskStatusDetail pipelineId={pipelineId} stepId={currentStep || ""} />
  ) : (
    <OtherTaskStatusDetail pipelineId={pipelineId} stepId={currentStep || ""} />
  );
};
