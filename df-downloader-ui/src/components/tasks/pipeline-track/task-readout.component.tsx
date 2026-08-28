import { Box, Stack, Typography } from "@mui/material";
import {
  activeMsSoFar,
  bytesToHumanReadable,
  DownloadProgressUtils,
  estimateProgressTimeRemainingMs,
  TaskStatus,
} from "df-downloader-common";
import prettyMilliseconds from "pretty-ms";
import { useSelector } from "react-redux";
import {
  selectBasicTaskField,
  selectCurrentStep,
  selectDownloadTask,
  selectTaskState,
} from "../../../store/df-tasks/tasks.selector";
import { monoFontFamily } from "../../../themes/build-theme";

export type Readout = { label: string; value: string };

const formatMs = (ms?: number) =>
  ms === undefined ? undefined : prettyMilliseconds(ms, { secondsDecimalDigits: 0, unitCount: 2 });

/**
 * The figures under the track, as labelled pairs rather than a run-on line.
 *
 * All values are monospaced and tabular, so a rate ticking between 184.2 and
 * 99.7 MB/s does not shove the columns around - the whole point of shipping
 * JetBrains Mono in Phase A.
 */
export const TaskReadout = ({ pipelineId }: { pipelineId: string }) => {
  const currentStep = useSelector(selectCurrentStep(pipelineId)) ?? "";
  const taskState = useSelector(selectTaskState(pipelineId, currentStep));
  const isRunning = taskState === "running";
  const downloadTask = useSelector(selectDownloadTask(pipelineId, currentStep));
  const status = useSelector(selectBasicTaskField<"status", TaskStatus | null>(pipelineId, currentStep, "status"));
  const startTime = useSelector(
    selectBasicTaskField<"startTime", Date | undefined>(pipelineId, currentStep, "startTime")
  );

  const readouts: Readout[] = [];
  const progress = downloadTask?.status?.currentProgress;

  if (progress) {
    readouts.push({ label: "Progress", value: `${progress.percentComplete.toFixed(1)} %` });
    readouts.push({ label: "Rate", value: `${bytesToHumanReadable(progress.currentBytesPerSecond || 0)}/s` });
    readouts.push({
      label: "Transferred",
      value: `${bytesToHumanReadable(progress.totalBytesDownloaded || 0)} / ${bytesToHumanReadable(
        progress.totalBytes || 0
      )}`,
    });
    // Only project forward while the task is actually running. A paused
    // download has a rate of zero, and an estimate built on that is fiction -
    // see calculateTimeRemainingSeconds.
    const remaining = isRunning ? DownloadProgressUtils.calculateTimeRemainingSeconds(progress) : undefined;
    if (remaining !== undefined) {
      readouts.push({ label: "Remaining", value: formatMs(remaining * 1000) ?? "-" });
    }
    if (progress.retries) {
      readouts.push({ label: "Attempt", value: String(progress.retries + 1) });
    }
  } else if (status?.progress) {
    readouts.push({ label: "Progress", value: `${status.progress.percent.toFixed(0)} %` });
    if (status.progress.detail) {
      readouts.push({ label: "Detail", value: status.progress.detail });
    }
    const remainingMs = isRunning ? estimateProgressTimeRemainingMs(startTime, status.progress) : undefined;
    if (remainingMs !== undefined) {
      readouts.push({ label: "Remaining", value: formatMs(remainingMs) ?? "-" });
    }
  }

  // Elapsed keeps running while paused (correct - it is wall clock); Active
  // stops. Showing both is what makes a paused row honest: "Elapsed 6m 29s,
  // Active 2m 14s" says more than either number alone, and neither is
  // extrapolated unless the task is running.
  const activeMs = activeMsSoFar(status);
  if (startTime) {
    const elapsedMs = Date.now() - new Date(startTime).getTime();
    readouts.push({ label: "Elapsed", value: formatMs(elapsedMs) ?? "-" });
    if (activeMs !== undefined && Math.abs(elapsedMs - activeMs) >= 2000) {
      readouts.push({ label: "Active", value: formatMs(activeMs) ?? "-" });
    }
  }

  if (readouts.length === 0) {
    return null;
  }

  return (
    <Stack
      direction="row"
      sx={{ flexWrap: "wrap", columnGap: 3, rowGap: 0.5, marginTop: 1 }}
    >
      {readouts.map(({ label, value }) => (
        <Box key={label} sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: "0.5625rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "text.disabled",
              lineHeight: 1.3,
            }}
          >
            {label}
          </Typography>
          <Typography
            noWrap
            sx={{
              fontFamily: monoFontFamily,
              fontSize: "0.75rem",
              fontVariantNumeric: "tabular-nums",
              color: "text.primary",
              lineHeight: 1.4,
            }}
          >
            {value}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
};
