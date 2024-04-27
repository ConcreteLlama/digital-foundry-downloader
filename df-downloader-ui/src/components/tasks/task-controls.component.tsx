import ClearIcon from "@mui/icons-material/Clear.js";
import PauseButtonIcon from "@mui/icons-material/Pause";
import StartButtonIcon from "@mui/icons-material/PlayArrow";
import StopButton from "@mui/icons-material/Stop";
import { ButtonGroup, IconButton, Tooltip } from "@mui/material";
import { ControlPipelineRequest, TaskPipelineAction } from "df-downloader-common";
import { Fragment, useState } from "react";
import { useSelector } from "react-redux";
import { API_URL } from "../../config";
import { ResumeIcon } from "../../icons/resume-icon.component.tsx";
import {
  selectBasicTaskField,
  selectCurrentStep,
  selectIsComplete,
  selectTaskState,
  selectTaskStatusField,
} from "../../store/df-tasks/tasks.selector.ts";
import { postJson } from "../../utils/fetch";
import { BasicDialog } from "../general/basic-dialog.component.tsx";

const sendTaskControlRequest = async (pipelineExecutionId: string, action: TaskPipelineAction) => {
  const body: ControlPipelineRequest = {
    pipelineExecutionId,
    action,
  };
  await postJson(`${API_URL}/tasks/control`, body);
};

type TaskControlsProps = {
  pipelineId: string;
};
export const TaskControls = ({ pipelineId }: TaskControlsProps) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const taskState = useSelector(selectTaskState(pipelineId, currentStep || ""));
  const capabilities = useSelector(selectBasicTaskField(pipelineId, currentStep || "", "capabilities"));
  const isComplete = useSelector(selectIsComplete(pipelineId));
  const pauseTrigger = useSelector(selectTaskStatusField(pipelineId, currentStep || "", "pauseTrigger"));
  const isPausingOrCancelling = taskState === "pausing" || taskState === "cancelling";
  const buttonsDisabled = isComplete || isPausingOrCancelling;
  const startButton =
    pauseTrigger === "auto" || taskState === "idle" ? (
      <ForceStartButton pipelineId={pipelineId} disabled={buttonsDisabled} />
    ) : taskState === "running" ? (
      <PauseButton pipelineId={pipelineId} disabled={buttonsDisabled} />
    ) : (
      <ResumeButton pipelineId={pipelineId} disabled={buttonsDisabled} />
    );
  const cancelEnabled = capabilities?.includes("cancel") && taskState !== "cancelling";
  return (
    <ButtonGroup>
      {isComplete ? (
        <IconButton onClick={() => sendTaskControlRequest(pipelineId, "clear")}>
          <ClearIcon />
        </IconButton>
      ) : (
        <Fragment>
          {startButton}
          <IconButton disabled={!cancelEnabled} onClick={() => sendTaskControlRequest(pipelineId, "cancel")}>
            <StopButton />
          </IconButton>{" "}
        </Fragment>
      )}
    </ButtonGroup>
  );
};

type ActionButtonProps = {
  pipelineId: string;
  disabled: boolean;
};
const ResumeButton = ({ pipelineId, disabled }: ActionButtonProps) => {
  return (
    <Tooltip title="Resume">
      <IconButton disabled={disabled} onClick={() => sendTaskControlRequest(pipelineId, "resume")}>
        <ResumeIcon />
      </IconButton>
    </Tooltip>
  );
};

const PauseButton = ({ pipelineId, disabled }: ActionButtonProps) => {
  return (
    <Tooltip title="Pause">
      <IconButton disabled={disabled} onClick={() => sendTaskControlRequest(pipelineId, "pause")}>
        <PauseButtonIcon />
      </IconButton>
    </Tooltip>
  );
};

const ForceStartButton = ({ pipelineId, disabled }: ActionButtonProps) => {
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const openConfirmDialog = () => {
    setConfirmDialogOpen(true);
  };
  const closeConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };
  const onConfirm = () => {
    sendTaskControlRequest(pipelineId, "force_start");
    closeConfirmDialog();
  };
  return (
    <Fragment>
      <BasicDialog
        open={confirmDialogOpen}
        onClose={closeConfirmDialog}
        title={"Force Start"}
        content={"Are you sure you want to force start this task?"}
        confirmButtonText={"Force Start"}
        onConfirm={onConfirm}
      />
      <Tooltip title="Force Start">
        <IconButton disabled={disabled} onClick={openConfirmDialog}>
          <StartButtonIcon />
        </IconButton>
      </Tooltip>
    </Fragment>
  );
};
