import { Typography } from "@mui/material";
import { capitalizeFirstLetter } from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectTaskState, selectTaskStatusField } from "../../../store/df-tasks/tasks.selector";

export type StepStatusDescriptionProps = {
  pipelineId: string;
  stepId: string;
};

/**
 * What a task is doing, in words, whenever it is not actively running.
 *
 * This is a restoration, not a new idea: the old DownloadTaskStatusDetail
 * rendered exactly this for every non-running state, and the Phase D rewrite
 * dropped it - so a queued or paused download rendered as a title, an empty
 * track and two buttons, with no text anywhere saying why nothing was
 * happening. That is the worst possible thing for this app specifically: the
 * request queue deliberately spaces and backs off requests to Digital
 * Foundry, so "stopped for a reason" is a normal state that MUST explain
 * itself (see df-request-queue.ts, and the note in CLAUDE.md about actions
 * visibly pausing with no on-screen explanation).
 */
export const StepStatusDescription = ({ pipelineId, stepId }: StepStatusDescriptionProps) => {
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const message = useSelector(selectTaskStatusField(pipelineId, stepId, "message"));
  const attempt = useSelector(selectTaskStatusField(pipelineId, stepId, "attempt"));
  const pauseTrigger = useSelector(selectTaskStatusField(pipelineId, stepId, "pauseTrigger"));

  const attemptInfo = taskState === "awaiting_retry" && attempt ? ` (attempt ${attempt})` : "";
  const pauseInfo = taskState === "paused" && pauseTrigger ? ` (${pauseTrigger})` : "";
  const label = capitalizeFirstLetter((taskState || "queued").replace(/_/g, " "));
  const text = `${label}${attemptInfo}${pauseInfo}${message ? `: ${message}` : ""}`;

  return (
    <Typography
      sx={{
        fontSize: "0.75rem",
        color: taskState === "failed" ? "error.main" : "text.secondary",
        marginTop: 1,
        overflowWrap: "anywhere",
      }}
    >
      {text}
    </Typography>
  );
};
