import { useSelector } from "react-redux";
import { selectBasicTaskField, selectCurrentStep, selectIsComplete } from "../../../store/df-tasks/tasks.selector.ts";
import { CompletedTaskStatusDetail } from "./completed-task-status-detail.component.tsx";
import { DownloadTaskStatusDetail } from "./download-task-status-detail.component.tsx";
import { TaskPipelineStepper } from "../progress-stepper/task-pipeline-stepper.component.tsx";

export const TaskStatusDetail = ({ pipelineId }: { pipelineId: string }) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const taskType = useSelector(selectBasicTaskField(pipelineId, currentStep || "", "taskType"));
  const isComplete = useSelector(selectIsComplete(pipelineId));
  return isComplete ? (
    <CompletedTaskStatusDetail pipelineId={pipelineId} />
  ) : taskType === "download" ? (
    <DownloadTaskStatusDetail pipelineId={pipelineId} stepId={currentStep || ""} />
  ) : (
    <TaskPipelineStepper pipelineId={pipelineId} />
  );
};
