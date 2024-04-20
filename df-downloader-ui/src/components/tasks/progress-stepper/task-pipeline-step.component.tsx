import { Step, StepLabel, StepProps } from "@mui/material";
import { TaskPipelineStepIcon } from "./task-pipeline-step-icon.component.tsx";
import { useSelector } from "react-redux";
import { selectPipelineDetails, selectTaskState } from "../../../store/df-tasks/tasks.selector.ts";

const isCompleted = (taskState?: string) =>
  taskState === "success" || taskState === "cancelled" || taskState === "failed";

export type TaskPipelineStepProps = {
  pipelineId: string;
  stepId: string;
} & StepProps;
export const TaskPipelineStep = ({ pipelineId, stepId, ...props }: TaskPipelineStepProps) => {
  const pipelineDetails = useSelector(selectPipelineDetails(pipelineId));
  const stepName = pipelineDetails?.steps[stepId]?.name || "UNKNOWN";
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const isCompletedStep = isCompleted(taskState);
  return (
    <Step {...props} active={taskState && taskState !== "idle" && !isCompletedStep} completed={isCompletedStep}>
      <StepLabel
        StepIconComponent={(props) => (
          <TaskPipelineStepIcon {...props} stepName={stepName} taskState={taskState} error={taskState === "failed"} />
        )}
      />
    </Step>
  );
};
