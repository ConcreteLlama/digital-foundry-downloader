import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { TaskInfo, TaskState } from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectPipeline } from "../../store/df-tasks/tasks.selector.ts";

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

/**
 * How long a step took, or - if it's still going - how long it has been
 * going. A step that never started (the pipeline failed before reaching it,
 * or it was skipped) has no start time and reports nothing rather than a
 * misleading zero.
 */
const stepDuration = (task?: TaskInfo | null): string => {
  if (!task?.startTime) {
    return "-";
  }
  const start = new Date(task.startTime).getTime();
  const end = task.endTime ? new Date(task.endTime).getTime() : Date.now();
  return formatDuration(end - start);
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
};

/**
 * The full story of a pipeline run: what it was, how each step went, and how
 * long each one took.
 *
 * The task list itself only has room for the current step and a status line,
 * which is fine while something is running but leaves no way to see where
 * time actually went - or, for a failure, which step failed and why.
 */
export const TaskDetailsDialog = ({ pipelineId, open, onClose }: TaskDetailsDialogProps) => {
  const pipeline = useSelector(selectPipeline(pipelineId));
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

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ wordBreak: "break-word" }}>
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
          <SummaryRow label="Total time" value={totalElapsed} />
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
                <TableCell align="right">Duration</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stepOrder.map((stepId) => {
                const task = stepTasks[stepId];
                const state = task?.status?.state;
                // Three distinct cases, and conflating them loses real
                // information: a step with no task was genuinely skipped (the
                // pipeline had nothing to do - no metadata to embed, say),
                // whereas a carried-over one completed in an earlier run and
                // was inherited when the pipeline resumed. Showing the latter
                // as "skipped" made a resumed download report that it had
                // skipped downloading, which is alarming and untrue.
                const stateLabel = task?.carriedOver
                  ? "done earlier"
                  : state ?? (task ? "pending" : "skipped");
                return (
                  <TableRow key={stepId}>
                    <TableCell>{steps[stepId]?.name || stepId}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={stateLabel}
                        color={task?.carriedOver ? "success" : state ? STATE_COLOURS[state] || "default" : "default"}
                        // Outlined for anything that didn't run in this run,
                        // so carried-over and skipped both read as "not this
                        // time" at a glance while still being distinguishable.
                        variant={state && !task?.carriedOver ? "filled" : "outlined"}
                      />
                    </TableCell>
                    <TableCell align="right">{formatTime(task?.startTime)}</TableCell>
                    <TableCell align="right">{stepDuration(task)}</TableCell>
                  </TableRow>
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
    </Dialog>
  );
};
