import { Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { TaskState } from "df-downloader-common";
import { useDispatch, useSelector } from "react-redux";
import { controlTaskAction } from "../../store/df-tasks/tasks.action.ts";
import { selectTask } from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * A job that is not part of a pipeline.
 *
 * Everything else on this page is a pipeline - a download and the steps that
 * follow it - but the task manager also tracks standalone work: a bulk
 * backfill, a batch file move, a scan for existing content. Those were
 * reaching the browser and being kept in the store, with selectors written
 * for them, and then never rendered, so a backfill running for hours showed
 * nowhere at all.
 *
 * Only tasks the manager tracks in its own map appear here, which is what
 * keeps this from duplicating pipeline steps - a pipeline's steps are tasks
 * too, but they live in a separate map and are already drawn as part of
 * their pipeline.
 */

const TASK_LABELS: Record<string, string> = {
  bulk_backfill: "Backfill",
  batch_move_files: "Moving files",
  clear_missing_files: "Clearing missing files",
  scan_for_existing_content: "Scanning for existing content",
  remove_empty_dirs: "Removing empty folders",
};

/** Falls back to the type itself, tidied, so a new task type is still legible. */
const labelFor = (taskType: string) =>
  TASK_LABELS[taskType] ?? taskType.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

const STATE_LABELS: Partial<Record<TaskState, string>> = {
  idle: "Queued",
  awaiting_retry: "Waiting to retry",
  running: "Running",
  pausing: "Pausing",
  paused: "Paused",
  success: "Done",
  failed: "Failed",
  cancelling: "Cancelling",
  cancelled: "Cancelled",
};

export type StandaloneTaskInfoProps = {
  taskId: string;
};

export const StandaloneTaskInfo = ({ taskId }: StandaloneTaskInfoProps) => {
  const task = useSelector(selectTask(taskId));
  const dispatch = useDispatch();

  if (!task) {
    return null;
  }

  const status = task.status;
  const state = status?.state;
  const progress = status?.progress;
  const capabilities = task.capabilities ?? [];
  const isComplete = Boolean(status?.isComplete);
  const paused = state === "paused" || state === "pausing";

  const control = (action: "pause" | "resume" | "cancel" | "clear") =>
    dispatch(controlTaskAction.start({ taskId, action }));

  const tone =
    state === "failed" ? "error.main" : state === "cancelled" ? "text.disabled" : state === "success" ? "success.main" : "text.secondary";

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        padding: 1.25,
        backgroundColor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap" }} useFlexGap>
        <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, flex: "1 1 auto", minWidth: 0 }}>
          {labelFor(task.taskType)}
        </Typography>
        <Typography variant="caption" sx={{ color: tone, fontFamily: monoFontFamily }}>
          {(state && STATE_LABELS[state]) ?? state}
        </Typography>
      </Stack>

      {(status?.message || progress?.detail) && (
        <Typography variant="caption" sx={{ display: "block", color: "text.disabled", marginTop: 0.25 }}>
          {progress?.detail ?? status?.message}
        </Typography>
      )}

      {progress && !isComplete && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, marginTop: 0.75 }}>
          <LinearProgress
            variant="determinate"
            value={Math.max(0, Math.min(100, progress.percent))}
            sx={{ flex: "1 1 auto", borderRadius: 1 }}
          />
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" }}
          >
            {Math.round(progress.percent)}%
          </Typography>
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ marginTop: 1 }}>
        {!isComplete && capabilities.includes("pause") && (
          <Button size="small" onClick={() => control(paused ? "resume" : "pause")}>
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
        {!isComplete && capabilities.includes("cancel") && (
          <Button size="small" color="error" onClick={() => control("cancel")}>
            Stop
          </Button>
        )}
        {isComplete && (
          <Button size="small" onClick={() => control("clear")}>
            Clear
          </Button>
        )}
      </Stack>
    </Box>
  );
};
