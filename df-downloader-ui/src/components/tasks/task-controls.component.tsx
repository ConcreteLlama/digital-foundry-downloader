import ClearIcon from "@mui/icons-material/Clear.js";
import PauseButtonIcon from "@mui/icons-material/Pause";
import StartButtonIcon from "@mui/icons-material/PlayArrow";
import StopButton from "@mui/icons-material/Stop";
import { ButtonGroup, IconButton, Tooltip } from "@mui/material";
import { Fragment, useState } from "react";
import { useSelector } from "react-redux";
import { ResumeIcon } from "../../icons/resume-icon.component.tsx";
import {
  selectBasicTaskField,
  selectCurrentStep,
  selectIsComplete,
  selectTaskState,
  selectTaskStatusField,
} from "../../store/df-tasks/tasks.selector.ts";
import { BasicDialog } from "../general/basic-dialog.component.tsx";
import { controlPipeline, clearPipeline } from "../../api/tasks.ts";



type TaskControlsProps = {
  pipelineId: string;
  /**
   * Shrinks the buttons from 40px to 30px. The default is right on the
   * Activity page, which is wide; in the content dialog's side column two
   * 40px buttons sit next to a 4px progress track and set the height of the
   * whole card, which reads as cramped and oversized at the same time.
   */
  size?: "small" | "medium";
};
export const TaskControls = ({ pipelineId, size = "medium" }: TaskControlsProps) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const taskState = useSelector(selectTaskState(pipelineId, currentStep || ""));
  const capabilities = useSelector(selectBasicTaskField(pipelineId, currentStep || "", "capabilities"));
  const isComplete = useSelector(selectIsComplete(pipelineId));
  const pauseTrigger = useSelector(selectTaskStatusField(pipelineId, currentStep || "", "pauseTrigger"));
  /** Held out of the queue by hand rather than paused mid-run - see TaskStatus.held. */
  const held = Boolean(useSelector(selectTaskStatusField(pipelineId, currentStep || "", "held")));
  const isPausingOrCancelling = taskState === "pausing" || taskState === "cancelling";
  const buttonsDisabled = isComplete || isPausingOrCancelling;
  /*
   * Queued work gets both: jump the queue, or hold it where it is.
   *
   * Holding a queued task used to be impossible - the only control offered was
   * Force start - even though "don't run this one yet" is the most obvious
   * thing to want from a queue you can see. The task itself has nothing to
   * suspend, so the service holds it out of its selection instead; a held task
   * reports itself paused, which is why it falls through to Resume below.
   */
  const startButton =
    pauseTrigger === "auto" ? (
      <ForceStartButton pipelineId={pipelineId} disabled={buttonsDisabled} size={size} />
    ) : taskState === "running" ? (
      <PauseButton pipelineId={pipelineId} disabled={buttonsDisabled} size={size} />
    ) : taskState === "idle" ? (
      <Fragment>
        <ForceStartButton pipelineId={pipelineId} disabled={buttonsDisabled} size={size} />
        <PauseButton
          pipelineId={pipelineId}
          disabled={buttonsDisabled}
          size={size}
          label="Hold in the queue"
          ariaLabel="Hold this task in the queue"
        />
      </Fragment>
    ) : (
      <ResumeButton pipelineId={pipelineId} disabled={buttonsDisabled} size={size} />
    );
  /*
   * Stop asks the pipeline, not the step task, so the step's own capabilities
   * are the wrong thing to gate on for queued work.
   *
   * Anything not yet started can always be stopped - it is taken out of the
   * queue, whatever kind of task it is - which is why this was greyed out on a
   * queue of transcriptions that could perfectly well be dropped. Once running,
   * it comes down to whether the task can be interrupted, and there the
   * declared capability is the honest signal: transcription cannot stop
   * part-way, and offering a button that does nothing is worse than not
   * offering one.
   */
  const cancelEnabled =
    !isComplete &&
    taskState !== "cancelling" &&
    (taskState === "idle" || held || Boolean(capabilities?.includes("cancel")));
  // The isComplete branch that used to live here rendered a per-pipeline Clear
  // button, but it was unreachable: TaskStatusDetail returns
  // CompletedTaskStatusDetail before TaskControls is ever rendered for a
  // finished pipeline. Per-pipeline clearing is now offered by
  // CompletedTaskControls, which the completed row actually renders.
  return (
    <ButtonGroup>
      {startButton}
      {/* Named, like the rest of these. An icon button with only a tooltip has
          no accessible name, so a screen reader announces "button" and
          nothing else - and it cannot be found by name at all. */}
      <Tooltip title="Stop">
        <span>
          <IconButton
            size={size}
            disabled={!cancelEnabled}
            aria-label="Stop this task"
            onClick={() => controlPipeline(pipelineId, "cancel")}
          >
            <StopButton fontSize={size} />
          </IconButton>
        </span>
      </Tooltip>
    </ButtonGroup>
  );
};

type ActionButtonProps = {
  pipelineId: string;
  disabled: boolean;
  size?: "small" | "medium";
  /** Overrides the tooltip - a queued task is held, not paused. */
  label?: string;
  /** The full accessible name, since it does not always read as "<label> this task". */
  ariaLabel?: string;
};
const ResumeButton = ({ pipelineId, disabled, size = "medium" }: ActionButtonProps) => {
  return (
    <Tooltip title="Resume">
      <IconButton
        size={size}
        disabled={disabled}
        aria-label="Resume this task"
        onClick={() => controlPipeline(pipelineId, "resume")}
      >
        <ResumeIcon fontSize={size} />
      </IconButton>
    </Tooltip>
  );
};

const PauseButton = ({
  pipelineId,
  disabled,
  size = "medium",
  label = "Pause",
  ariaLabel = "Pause this task",
}: ActionButtonProps) => {
  return (
    <Tooltip title={label}>
      <IconButton
        size={size}
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => controlPipeline(pipelineId, "pause")}
      >
        <PauseButtonIcon fontSize={size} />
      </IconButton>
    </Tooltip>
  );
};

const ForceStartButton = ({ pipelineId, disabled, size = "medium" }: ActionButtonProps) => {
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const openConfirmDialog = () => {
    setConfirmDialogOpen(true);
  };
  const closeConfirmDialog = () => {
    setConfirmDialogOpen(false);
  };
  const onConfirm = () => {
    controlPipeline(pipelineId, "force_start");
    closeConfirmDialog();
  };
  return (
    <Fragment>
      <BasicDialog
        id="force-start-dialog"
        open={confirmDialogOpen}
        onClose={closeConfirmDialog}
        title={"Force Start"}
        content={"Are you sure you want to force start this task?"}
        confirmButtonText={"Force Start"}
        onConfirm={onConfirm}
      />
      <Tooltip title="Force Start">
        <IconButton size={size} disabled={disabled} aria-label="Force start this task" onClick={openConfirmDialog}>
          <StartButtonIcon fontSize={size} />
        </IconButton>
      </Tooltip>
    </Fragment>
  );
};

/**
 * Clear one finished pipeline. Restores an action that existed in the code but
 * could never be reached - only the bulk "Clear all" worked.
 */
export const CompletedTaskControls = ({ pipelineId }: TaskControlsProps) => (
  <Tooltip title="Clear from history">
    <IconButton
      size="small"
      aria-label="Clear this task from history"
      onClick={(event) => {
        event.stopPropagation();
        clearPipeline(pipelineId);
      }}
    >
      <ClearIcon fontSize="small" />
    </IconButton>
  </Tooltip>
);
