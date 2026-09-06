import {
  Box,
  Chip,
  Dialog,
  Collapse,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Tooltip,
} from "@mui/material";
import {
  DownloadTaskStatus,
  TaskInfo,
  TaskState,
  calculateTimeRemainingSeconds,
  estimateProgressTimeRemainingMs,
} from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectPipeline } from "../../store/df-tasks/tasks.selector.ts";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { activeMsSoFar } from "df-downloader-common";
import {
  derivePipelineStepViews,
  PipelineStepVisualState,
} from "./pipeline-track/pipeline-step-state";
import { Fragment, useState } from "react";
import { useTickingClock } from "../../hooks/use-ticking-clock";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { StepDetailPanel } from "./step-detail-panel.component";

/**
 * Renders a span of milliseconds the way someone reading a task list wants to
 * see it - "2m 14s", not "134.2s" or "00:02:14". Sub-minute durations keep
 * one decimal so a fast step doesn't just read "0s".
 */
const formatDuration = (ms: number): string => {
  if (!isFinite(ms) || ms < 0) {
    return "-";
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds < 10 ? totalSeconds.toFixed(1) : Math.round(totalSeconds)}s`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
};

const formatTime = (date?: Date) => (date ? new Date(date).toLocaleTimeString() : "-");

const STATE_COLOURS: Partial<Record<TaskState, "success" | "error" | "warning" | "info" | "default">> = {
  success: "success",
  failed: "error",
  cancelled: "warning",
  running: "info",
};

/** One label per shared visual state - see pipeline-step-state.ts. */
const STEP_STATE_LABELS: Record<PipelineStepVisualState, string> = {
  done: "success",
  carried_over: "done earlier",
  running: "running",
  paused: "paused",
  failed: "failed",
  cancelled: "cancelled",
  skipped: "skipped",
  not_applicable: "not needed",
  pending: "pending",
  delegated: "running separately",
};

const STEP_STATE_CHIP_COLOURS: Record<
  PipelineStepVisualState,
  "success" | "error" | "warning" | "info" | "default"
> = {
  done: "success",
  carried_over: "success",
  running: "info",
  delegated: "info",
  paused: "warning",
  failed: "error",
  cancelled: "default",
  skipped: "default",
  not_applicable: "default",
  pending: "default",
};

/**
 * How long a step took, or - if it's still going - how long it has been
 * going. A step that never started (the pipeline failed before reaching it,
 * or it was skipped) has no start time and reports nothing rather than a
 * misleading zero.
 */
/**
 * Wall clock since the step first started - keeps running while paused, which
 * is correct for "elapsed" and is why it is now labelled that rather than the
 * ambiguous "duration".
 */
const stepElapsed = (task?: TaskInfo | null): string => {
  if (!task?.startTime) {
    return "-";
  }
  const start = new Date(task.startTime).getTime();
  const end = task.endTime ? new Date(task.endTime).getTime() : Date.now();
  return formatDuration(end - start);
};

/**
 * Working time - stops while paused. Shown only when it differs meaningfully
 * from elapsed, so an ordinary uninterrupted step doesn't carry two nearly
 * identical numbers.
 */
const stepActive = (task?: TaskInfo | null): string | undefined => {
  const activeMs = activeMsSoFar(task?.status);
  if (activeMs === undefined || !task?.startTime) {
    return undefined;
  }
  const start = new Date(task.startTime).getTime();
  const end = task.endTime ? new Date(task.endTime).getTime() : Date.now();
  // Within a couple of seconds of wall clock means nothing was ever paused.
  if (Math.abs(end - start - activeMs) < 2000) {
    return undefined;
  }
  return formatDuration(activeMs);
};

/**
 * How far a running step has got, from whichever of the two shapes it
 * reports in.
 *
 * Downloads carry bytes and a live transfer rate, so their estimate comes
 * from that rate directly. Everything else reports a bare percentage, so the
 * estimate has to be extrapolated from elapsed time. Finished steps report
 * nothing - a completed bar sitting at 100% is just noise next to a duration
 * that already says how long it took.
 */
const stepProgress = (task?: TaskInfo | null) => {
  const status = task?.status;
  if (!status || status.isComplete) {
    return undefined;
  }
  const download = (status as DownloadTaskStatus).currentProgress;
  if (download?.totalBytes) {
    return {
      percent: download.percentComplete,
      remainingMs:
        calculateTimeRemainingSeconds(
          download.totalBytesDownloaded,
          download.totalBytes,
          download.currentBytesPerSecond || 1
        ) * 1000,
      detail: undefined as string | undefined,
    };
  }
  if (!status.progress) {
    return undefined;
  }
  return {
    percent: status.progress.percent,
    remainingMs: estimateProgressTimeRemainingMs(task?.startTime, status.progress),
    detail: status.progress.detail,
  };
};

const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="baseline">
    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ textAlign: "right", wordBreak: "break-word" }}>
      {value ?? "-"}
    </Typography>
  </Stack>
);

export type TaskDetailsDialogProps = {
  pipelineId: string;
  open: boolean;
  onClose: () => void;
  /**
   * Suppresses the title's link through to the content. Set when this dialog
   * was opened FROM the content detail - otherwise the link stacks a second
   * copy of the content you are already looking at on top of itself.
   */
  hideContentLink?: boolean;
};

/**
 * The full story of a pipeline run: what it was, how each step went, and how
 * long each one took.
 *
 * The task list itself only has room for the current step and a status line,
 * which is fine while something is running but leaves no way to see where
 * time actually went - or, for a failure, which step failed and why.
 */
export const TaskDetailsDialog = ({
  pipelineId,
  open,
  onClose,
  hideContentLink,
}: TaskDetailsDialogProps) => {
  const pipeline = useSelector(selectPipeline(pipelineId));
  // Stacked over this dialog rather than replacing it, so closing the content
  // returns you to the run you were looking at.
  const [contentOpen, setContentOpen] = useState(false);
  /*
   * Which steps are drilled into. Nothing is expanded by default except the
   * one running - the table is meant to be scannable, and a step's detail is
   * variable in size and mostly interesting for whatever is happening now.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  /*
   * Elapsed and active are derived from the current time at render, so they
   * are only as fresh as the last render. A running analysis can spend ten
   * minutes inside one model call without emitting a state change, and the
   * readout sat frozen for all of it - which looks like a stalled job rather
   * than a quiet one. Ticks only while something is still going.
   *
   * Before the early return below: hooks cannot be called conditionally.
   */
  useTickingClock(Boolean(pipeline) && !pipeline?.pipelineStatus?.isComplete);
  if (!pipeline) {
    return null;
  }
  const { pipelineDetails, pipelineStatus, stepTasks } = pipeline;
  const { dfContent, mediaFormat, queuedTime, destinationPath, stepOrder, steps } = pipelineDetails;

  const startedTasks = stepOrder.map((stepId) => stepTasks[stepId]).filter((task) => task?.startTime);
  const firstStart = startedTasks.length
    ? Math.min(...startedTasks.map((task) => new Date(task.startTime!).getTime()))
    : undefined;
  const allEnded = startedTasks.length > 0 && startedTasks.every((task) => task.endTime);
  const lastEnd = allEnded
    ? Math.max(...startedTasks.map((task) => new Date(task.endTime!).getTime()))
    : undefined;
  const totalElapsed =
    firstStart !== undefined ? formatDuration((lastEnd ?? Date.now()) - firstStart) : "-";
  // Only one step runs at a time, so the running step's estimate is the
  // pipeline's - the steps after it are typically seconds (writing a sidecar,
  // moving a file) against minutes or hours for this one.
  const stepViews = derivePipelineStepViews(pipeline);
  const showContentLink = Boolean(dfContent) && !hideContentLink;
  const timeRemaining = stepOrder
    .map((stepId) => stepProgress(stepTasks[stepId])?.remainingMs)
    .find((remaining) => remaining !== undefined);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {/* The title doubles as the way into the content itself - a task is
            nearly always looked at because of the video behind it, and there
            was previously no route from one to the other. */}
        <Typography
          variant="h6"
          onClick={showContentLink ? () => setContentOpen(true) : undefined}
          sx={{
            wordBreak: "break-word",
            ...(showContentLink && {
              cursor: "pointer",
              "&:hover": { textDecoration: "underline" },
            }),
          }}
          title={showContentLink ? "View content details" : undefined}
        >
          {dfContent?.title || "Unknown content"}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={pipeline.pipelineType} />
          {mediaFormat && <Chip size="small" variant="outlined" label={mediaFormat} />}
          {pipelineStatus.pipelineResult && (
            <Chip
              size="small"
              label={pipelineStatus.pipelineResult}
              color={STATE_COLOURS[pipelineStatus.pipelineResult as TaskState] || "default"}
            />
          )}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <SummaryRow label="Status" value={pipelineStatus.statusMessage} />
          <SummaryRow label="Queued" value={formatTime(queuedTime)} />
          <SummaryRow label="Elapsed" value={totalElapsed} />
          {timeRemaining !== undefined && (
            <SummaryRow label="Time remaining" value={`about ${formatDuration(timeRemaining)}`} />
          )}
          {destinationPath && <SummaryRow label="Destination" value={destinationPath} />}
        </Stack>

        <Divider sx={{ mb: 1 }} />
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Steps
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Step</TableCell>
                <TableCell>State</TableCell>
                <TableCell align="right">Started</TableCell>
                <TableCell align="right">Elapsed</TableCell>
                <TableCell align="right">Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stepViews.map((view) => {
                const { stepId, task, state } = view;
                // One shared derivation with the card's track - see
                // pipeline-step-state.ts. Deriving this here from the task
                // object alone meant a step not yet instantiated (no task) was
                // labelled "skipped", so every FUTURE step read as skipped
                // while the track correctly showed it pending.
                //
                // "done earlier" is preserved from that original handling: a
                // carried-over step completed in a previous run and was
                // inherited on resume, and calling it skipped made a resumed
                // download report that it had skipped downloading.
                const stateLabel = STEP_STATE_LABELS[state];
                const progress = stepProgress(task);
                const hasDetail = Boolean(progress || task?.status?.phases?.length || task?.status?.message);
                // Defaults open for the step actually running, so the common
                // case needs no click, and closed once it is not.
                const isOpen = expanded[stepId] ?? (view.isCurrent && state === "running");
                return (
                  <Fragment key={stepId}>
                  {/* Shown rather than hidden here - the dialog is the
                      inventory, the card is the glance - but dimmed, because
                      it is not part of what this run will do. */}
                  <TableRow sx={state === "not_applicable" ? { opacity: 0.55 } : undefined}>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {/* Only where there is something behind it - an
                            affordance that opens an empty panel is worse than
                            no affordance. */}
                        {hasDetail ? (
                          <IconButton
                            size="small"
                            aria-label={isOpen ? `Hide ${view.name} detail` : `Show ${view.name} detail`}
                            onClick={() => setExpanded((current) => ({ ...current, [stepId]: !isOpen }))}
                            sx={{ padding: 0.25 }}
                          >
                            <ExpandMoreIcon
                              fontSize="small"
                              sx={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
                            />
                          </IconButton>
                        ) : (
                          <Box sx={{ width: 22 }} />
                        )}
                        <span>{view.name}</span>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={view.reason ?? ""} disableHoverListener={!view.reason}>
                        <Chip
                          size="small"
                          label={stateLabel}
                          color={STEP_STATE_CHIP_COLOURS[state]}
                          // Outlined for anything that didn't run in this run,
                          // so carried-over and skipped both read as "not this
                          // time" at a glance while still being distinguishable.
                          variant={state === "running" || state === "done" || state === "failed" ? "filled" : "outlined"}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">{formatTime(task?.startTime)}</TableCell>
                    <TableCell align="right">{stepElapsed(task)}</TableCell>
                    <TableCell align="right">{stepActive(task) ?? "-"}</TableCell>
                  </TableRow>
                  {/* One collapsible row rather than a column, and rather
                      than several rows always present. A step's detail varies
                      in size - a progress bar, a list of phases, a message -
                      and the table above it has to stay scannable on a phone.
                      Behind a disclosure it can grow without the row having
                      to. */}
                  {hasDetail && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ paddingY: 0, borderBottom: isOpen ? undefined : "none" }}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <StepDetailPanel task={task} progress={progress} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        {/* Messages and errors get their own block rather than a table column -
            they're long, and an error is the whole reason someone opens this. */}
        {stepOrder.some((stepId) => stepTasks[stepId]?.status?.error || stepTasks[stepId]?.status?.message) && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Details
            </Typography>
            <Stack spacing={1.5}>
              {stepOrder.map((stepId) => {
                const task = stepTasks[stepId];
                const error = task?.status?.error;
                const message = task?.status?.message;
                if (!error && !message) {
                  return null;
                }
                return (
                  <Box key={stepId}>
                    <Typography variant="body2" color="text.secondary">
                      {steps[stepId]?.name || stepId}
                    </Typography>
                    {message && (
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                        {message}
                      </Typography>
                    )}
                    {error && (
                      <Typography variant="body2" color="error.main" sx={{ wordBreak: "break-word" }}>
                        {typeof error === "string" ? error : JSON.stringify(error)}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </>
        )}
      </DialogContent>
      {showContentLink && (
        <MiddleModal
          open={contentOpen}
          onClose={() => setContentOpen(false)}
          id="task-details-content-detail-modal"
          hideCloseButton
        >
          <Box>
            {/* Keyed by `key`, not `name` - name is a cosmetic slug. The prop
                name predates that split. */}
            <DfContentInfoItemDetail dfContentName={dfContent.key} onClose={() => setContentOpen(false)} />
          </Box>
        </MiddleModal>
      )}
    </Dialog>
  );
};
