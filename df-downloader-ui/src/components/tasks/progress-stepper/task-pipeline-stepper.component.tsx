import CancelIcon from "@mui/icons-material/Cancel";
import CompleteIcon from "@mui/icons-material/CheckCircle";
import FailedIcon from "@mui/icons-material/Error";
import { Step, StepLabel, Stepper } from "@mui/material";
import { useSelector } from "react-redux";
import {
  selectCurrentStep,
  selectPipelineDetails,
  selectPipelineStatus,
} from "../../../store/df-tasks/tasks.selector.ts";
import { TaskPipelineStep } from "./task-pipeline-step.component.tsx";

export type TaskPipelineStepperProps = {
  pipelineId: string;
};

export const TaskPipelineStepper = ({ pipelineId }: TaskPipelineStepperProps) => {
  const { stepOrder } = useSelector(selectPipelineDetails(pipelineId));
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const activeStepIndex = stepOrder.findIndex((step) => step === currentStep);
  const { pipelineResult } = useSelector(selectPipelineStatus(pipelineId));
  return (
    <Stepper
      alternativeLabel
      activeStep={activeStepIndex}
      sx={{
        width: "100%",
      }}
    >
      {stepOrder.map((stepId, index) => (
        <TaskPipelineStep pipelineId={pipelineId} stepId={stepId} key={`${pipelineId}-step-${index}`} />
      ))}
      <Step last={true}>
        <StepLabel
          icon={
            pipelineResult === "failed" ? (
              <FailedIcon color="error" />
            ) : pipelineResult === "cancelled" ? (
              <CancelIcon />
            ) : (
              <CompleteIcon color={pipelineResult === "success" ? "success" : undefined} />
            )
          }
        />
      </Step>
    </Stepper>
  );
};
