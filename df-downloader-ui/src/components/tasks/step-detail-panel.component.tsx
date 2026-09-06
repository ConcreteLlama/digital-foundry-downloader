import { Box, LinearProgress, Stack, Typography } from "@mui/material";
import { TaskInfo, TaskPhase, formatDurationMs } from "df-downloader-common";
import { monoFontFamily } from "../../themes/build-theme";
import { TaskOutputFields } from "./task-output-fields.component";

const phaseDuration = (phase: TaskPhase) => {
  if (!phase.startedAt) {
    return undefined;
  }
  const end = phase.endedAt ? new Date(phase.endedAt).getTime() : Date.now();
  // Coarse: this is a read-only readout, not a value that round-trips.
  return formatDurationMs(end - new Date(phase.startedAt).getTime(), { coarse: true });
};

/** Muted for anything that has not run, so the eye lands on what has. */
const phaseColour = (phase: TaskPhase) =>
  phase.state === "running" ? "primary.main" : phase.state === "failed" ? "error.main" : "text.secondary";

export type StepDetailPanelProps = {
  task?: TaskInfo | null;
  progress?: { percent: number; detail?: string; remainingMs?: number };
};

/**
 * Everything a step has to say, behind a disclosure rather than in the row.
 *
 * The row is a fixed set of columns that has to stay readable on a phone; this
 * is where anything of variable size goes. A step reports what it has and this
 * renders whichever of those exist - nothing here knows what kind of task it
 * is looking at, which is the same bargain TaskProgress and TaskPhase make.
 *
 * Deliberately a container rather than a fixed layout: the useful thing to
 * show next is a phase's actual output, and that should be able to arrive
 * without this being redesigned around it.
 */
export const StepDetailPanel = ({ task, progress }: StepDetailPanelProps) => {
  const phases = task?.status?.phases;
  const message = task?.status?.message;
  /*
   * What the step produced, where it has anything to say.
   *
   * Shown above the message rather than below: a finished step's figures are
   * what someone opened this to read, and the running commentary underneath
   * has usually stopped being true by then.
   */
  const output = task?.status?.output;
  if (!progress && !phases?.length && !message && !output?.length) {
    return null;
  }
  return (
    <Stack spacing={1.5} sx={{ paddingY: 1.5, paddingLeft: 2 }}>
      {progress && (
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box sx={{ flexGrow: 1 }}>
              <LinearProgress variant="determinate" value={Math.min(100, Math.max(0, progress.percent))} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              {progress.percent.toFixed(0)}%
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            {progress.detail && (
              <Typography variant="caption" color="text.secondary">
                {progress.detail}
              </Typography>
            )}
            {progress.remainingMs !== undefined && (
              <Typography variant="caption" color="text.secondary">
                ~{formatDurationMs(progress.remainingMs, { coarse: true })} left
              </Typography>
            )}
          </Stack>
        </Stack>
      )}

      {output?.length ? <TaskOutputFields fields={output} /> : null}

      {phases?.length ? (
        <Stack spacing={0.25}>
          {phases.map((phase) => (
            <Stack
              key={phase.name}
              direction="row"
              spacing={1}
              sx={{ alignItems: "baseline", opacity: phase.state === "pending" ? 0.5 : 1 }}
            >
              <Typography variant="caption" sx={{ color: phaseColour(phase), minWidth: 0, flexGrow: 1 }}>
                {phase.name}
                {phase.detail ? (
                  <Typography component="span" variant="caption" color="text.secondary">
                    {" "}
                    - {phase.detail}
                  </Typography>
                ) : null}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontFamily: monoFontFamily, whiteSpace: "nowrap" }}
              >
                {phase.state === "running" ? "running" : phaseDuration(phase) ?? phase.state}
              </Typography>
            </Stack>
          ))}
        </Stack>
      ) : null}

      {message && (
        <Typography variant="caption" color="text.secondary">
          {message}
        </Typography>
      )}
    </Stack>
  );
};
