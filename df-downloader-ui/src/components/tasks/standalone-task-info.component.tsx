import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import { TaskState, isBulkBackfillTaskInfo } from "df-downloader-common";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { controlTaskAction } from "../../store/df-tasks/tasks.action.ts";
import { selectTask } from "../../store/df-tasks/tasks.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * A job that is not part of a pipeline.
 *
 * Everything else on the Activity page is a pipeline - a download and the
 * steps that follow it - but the task manager also tracks standalone work: a
 * bulk backfill, a batch file move, a scan for existing content.
 *
 * Only tasks the manager keeps in its own map appear here, which is what
 * stops this duplicating pipeline steps: those are tasks too, but they live
 * in a separate map and are already drawn as part of their pipeline.
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

const formatDuration = (ms: number) => {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

/**
 * The one-line version of what a run did.
 *
 * "Done" on its own is the one thing you already knew. The split is the
 * interesting part: 300 items producing 4 results is unremarkable if 296
 * already had the thing, and a real problem if they were skipped for want
 * of a transcript.
 */
const summaryLine = (backfill: {
  total: number;
  done: number;
  skipped: number;
  notApplicable: number;
  failed: number;
  pending: number;
}) => {
  const parts = [`${backfill.total} ${backfill.total === 1 ? "item" : "items"}`];
  if (backfill.done) parts.push(`${backfill.done} done`);
  if (backfill.skipped) parts.push(`${backfill.skipped} already had it`);
  if (backfill.notApplicable) parts.push(`${backfill.notApplicable} not applicable`);
  if (backfill.failed) parts.push(`${backfill.failed} failed`);
  if (backfill.pending) parts.push(`${backfill.pending} to go`);
  return parts.join(" · ");
};

export type StandaloneTaskInfoProps = {
  taskId: string;
};

export const StandaloneTaskInfo = ({ taskId }: StandaloneTaskInfoProps) => {
  const task = useSelector(selectTask(taskId));
  const dispatch = useDispatch();
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!task) {
    return null;
  }

  const status = task.status;
  const state = status?.state;
  const progress = status?.progress;
  const capabilities = task.capabilities ?? [];
  const isComplete = Boolean(status?.isComplete);
  const paused = state === "paused" || state === "pausing";
  // Work that has not started can always be held out of the queue and always
  // dropped from it, whatever the task itself declares it can do once running.
  const queued = state === "idle";
  const canPause = capabilities.includes("pause") || queued;
  const canCancel = capabilities.includes("cancel") || queued;
  const backfill = isBulkBackfillTaskInfo(task) ? task.status?.backfill : undefined;

  const control = (action: "pause" | "resume" | "cancel" | "clear") =>
    dispatch(controlTaskAction.start({ taskId, action }));

  const tone =
    state === "failed"
      ? "error.main"
      : state === "cancelled"
        ? "text.disabled"
        : state === "success"
          ? "success.main"
          : "text.secondary";

  const elapsed =
    task.startTime && task.endTime
      ? new Date(task.endTime).getTime() - new Date(task.startTime).getTime()
      : undefined;

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setDetailsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDetailsOpen(true);
          }
        }}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          padding: 1.25,
          backgroundColor: "background.paper",
          cursor: "pointer",
          transition: "border-color 140ms",
          "&:hover": { borderColor: "primary.main" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
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

        {backfill ? (
          <Typography variant="caption" sx={{ display: "block", color: "text.disabled", marginTop: 0.25 }}>
            {summaryLine(backfill)}
          </Typography>
        ) : (
          (status?.message || progress?.detail) && (
            <Typography variant="caption" sx={{ display: "block", color: "text.disabled", marginTop: 0.25 }}>
              {progress?.detail ?? status?.message}
            </Typography>
          )
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
          {!isComplete && canPause && (
            <Button
              size="small"
              // The card opens details; a control is not a request to do that.
              onClick={(event) => {
                event.stopPropagation();
                control(paused ? "resume" : "pause");
              }}
            >
              {paused ? "Resume" : queued ? "Hold" : "Pause"}
            </Button>
          )}
          {!isComplete && canCancel && (
            <Button
              size="small"
              color="error"
              onClick={(event) => {
                event.stopPropagation();
                control("cancel");
              }}
            >
              Stop
            </Button>
          )}
          {isComplete && (
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                control("clear");
              }}
            >
              Clear
            </Button>
          )}
        </Stack>
      </Box>

      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ paddingBottom: 1 }}>
          {labelFor(task.taskType)}
          <Typography variant="caption" sx={{ display: "block", color: tone, fontFamily: monoFontFamily }}>
            {(state && STATE_LABELS[state]) ?? state}
            {elapsed !== undefined && ` · took ${formatDuration(elapsed)}`}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {backfill ? (
            <>
              <Stack spacing={0.5}>
                <SummaryRow label="Items" value={backfill.total} />
                <SummaryRow label="Done" value={backfill.done} tone="success.main" />
                <SummaryRow label="Already had it" value={backfill.skipped} />
                <SummaryRow label="Not applicable" value={backfill.notApplicable} />
                <SummaryRow label="Failed" value={backfill.failed} tone={backfill.failed ? "error.main" : undefined} />
                {backfill.pending > 0 && <SummaryRow label="Still to go" value={backfill.pending} />}
              </Stack>
              {backfill.failures.length > 0 && (
                <>
                  <Divider sx={{ marginY: 1.5 }} />
                  <Typography variant="overline" sx={{ color: "text.disabled" }}>
                    Failures
                  </Typography>
                  <Stack spacing={0.75} sx={{ marginTop: 0.5 }}>
                    {backfill.failures.map((failure) => (
                      <Box key={failure.contentKey}>
                        <Typography sx={{ fontSize: "0.75rem", fontFamily: monoFontFamily }}>
                          {failure.contentKey}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "error.main" }}>
                          {failure.error}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                  {backfill.failuresTruncated && (
                    <Typography variant="caption" sx={{ display: "block", marginTop: 1, color: "text.disabled" }}>
                      Only the first {backfill.failures.length} are listed.
                    </Typography>
                  )}
                </>
              )}
            </>
          ) : (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {status?.message ?? "No further detail was recorded for this job."}
            </Typography>
          )}

          {status?.error && (
            <>
              <Divider sx={{ marginY: 1.5 }} />
              <Typography variant="caption" sx={{ color: "error.main" }}>
                {typeof status.error === "string" ? status.error : JSON.stringify(status.error)}
              </Typography>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const SummaryRow = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
  <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "baseline" }}>
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {label}
    </Typography>
    <Typography
      sx={{ fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums", color: tone ?? "text.primary" }}
    >
      {value}
    </Typography>
  </Stack>
);
