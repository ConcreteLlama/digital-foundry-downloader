import BlockIcon from "@mui/icons-material/Block";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { Box, Stack, SvgIconProps, Tooltip, Typography } from "@mui/material";
import { TaskState } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectCurrentStep,
  selectPipelineDetails,
  selectPipelineStatus,
  selectTaskState,
  selectTaskStatusField,
} from "../../../store/df-tasks/tasks.selector";
import { monoFontFamily } from "../../../themes/build-theme";

export type StepVisualState = "done" | "running" | "paused" | "failed" | "cancelled" | "skipped" | "pending";

/**
 * How a step is drawn.
 *
 * Same rule as the library row: never colour alone. The old stepper varied its
 * icon by STEP (download, subtitles, metadata...) and its colour by STATE, so
 * active, failed and skipped were separated by hue and nothing else. Here the
 * step's identity is its label and position on the track, which frees the icon
 * to carry state - and the segment fill carries it a third time.
 */
const STEP_SPECS: Record<StepVisualState, { colour: string; icon: React.FC<SvgIconProps>; fill: string }> = {
  done: { colour: "success.main", icon: CheckIcon, fill: "success.main" },
  running: { colour: "primary.main", icon: PlayArrowIcon, fill: "primary.main" },
  paused: { colour: "text.secondary", icon: PauseIcon, fill: "text.secondary" },
  failed: { colour: "error.main", icon: CloseIcon, fill: "error.main" },
  cancelled: { colour: "text.disabled", icon: BlockIcon, fill: "text.disabled" },
  skipped: { colour: "text.disabled", icon: BlockIcon, fill: "transparent" },
  pending: { colour: "text.disabled", icon: RadioButtonUncheckedIcon, fill: "transparent" },
};

const visualStateFor = (taskState: TaskState | undefined, isBeforeCurrent: boolean): StepVisualState => {
  switch (taskState) {
    case "success":
      return "done";
    case "running":
    case "pausing":
      return "running";
    case "paused":
    case "awaiting_retry":
      return "paused";
    case "failed":
      return "failed";
    case "cancelled":
    case "cancelling":
      return "cancelled";
    default:
      // A step the pipeline has already moved past but which never reported a
      // terminal state was skipped, not pending.
      return isBeforeCurrent ? "skipped" : "pending";
  }
};

export type PipelineTrackProps = {
  pipelineId: string;
  /** 0-100 within the running step, if it can report it. */
  activePercent?: number;
  /** Hides labels, for the one-line completed row. */
  dense?: boolean;
};

/**
 * The pipeline as a segmented track.
 *
 * MUI's Stepper with alternativeLabel spent ~90px of height on a row of dots.
 * This is the same information in ~30px: one proportional segment per step,
 * with the running one filling to its own progress rather than just being
 * marked "current". A failed pipeline keeps its whole track, so which step
 * died and which never ran stays visible - failure used to collapse to a
 * single error icon at the end.
 */
export const PipelineTrack = ({ pipelineId, activePercent, dense }: PipelineTrackProps) => {
  const details = useSelector(selectPipelineDetails(pipelineId));
  const currentStep = useSelector(selectCurrentStep(pipelineId));
  const stepOrder = details?.stepOrder ?? [];
  const currentIndex = stepOrder.findIndex((s) => s === currentStep);

  if (stepOrder.length === 0) {
    return null;
  }

  return (
    <Stack direction="row" spacing={0.5} sx={{ width: "100%" }}>
      {stepOrder.map((stepId, index) => (
        <TrackSegment
          key={stepId}
          pipelineId={pipelineId}
          stepId={stepId}
          name={details.steps[stepId]?.name ?? stepId}
          isBeforeCurrent={currentIndex >= 0 && index < currentIndex}
          isCurrent={stepId === currentStep}
          activePercent={activePercent}
          dense={dense}
        />
      ))}
    </Stack>
  );
};

type TrackSegmentProps = {
  pipelineId: string;
  stepId: string;
  name: string;
  isBeforeCurrent: boolean;
  isCurrent: boolean;
  activePercent?: number;
  dense?: boolean;
};

const TrackSegment = ({
  pipelineId,
  stepId,
  name,
  isBeforeCurrent,
  isCurrent,
  activePercent,
  dense,
}: TrackSegmentProps) => {
  const taskState = useSelector(selectTaskState(pipelineId, stepId));
  const message = useSelector(selectTaskStatusField(pipelineId, stepId, "message"));
  const visual = visualStateFor(taskState, isBeforeCurrent);
  const spec = STEP_SPECS[visual];
  const StepIcon = spec.icon;

  // Paused counts as in-progress here: pausing a download at 60% used to empty
  // its bar completely, which read as "lost everything" rather than "stopped".
  const holdsProgress = visual === "running" || visual === "paused";
  const hasPercent = typeof activePercent === "number";
  const fillPercent =
    holdsProgress && hasPercent
      ? Math.min(Math.max(activePercent, 0), 100)
      : visual === "done" || visual === "failed" || visual === "cancelled"
      ? 100
      : 0;
  // A running step that cannot report a percentage (most non-download steps)
  // would otherwise render as an empty bar, indistinguishable from pending.
  const indeterminate = visual === "running" && !hasPercent;

  return (
    <Tooltip title={message ? `${name} - ${message}` : name}>
      <Box
        tabIndex={0}
        role="img"
        aria-label={message ? `${name} - ${message}` : `${name} - ${visual}`}
        sx={{ flex: 1, minWidth: 0, "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" } }}
      >
        <Box
          sx={{
            height: 4,
            borderRadius: 1,
            backgroundColor: "action.hover",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <Box
            sx={
              indeterminate
                ? {
                    height: "100%",
                    width: "100%",
                    backgroundImage: `linear-gradient(90deg, transparent 0%, ${"currentColor"} 50%, transparent 100%)`,
                    color: spec.fill,
                    backgroundSize: "40% 100%",
                    backgroundRepeat: "no-repeat",
                    animation: "df-track-indeterminate 1200ms ease-in-out infinite",
                    "@keyframes df-track-indeterminate": {
                      from: { backgroundPosition: "-40% 0" },
                      to: { backgroundPosition: "140% 0" },
                    },
                    "@media (prefers-reduced-motion: reduce)": {
                      animation: "none",
                      backgroundSize: "100% 100%",
                      opacity: 0.5,
                    },
                  }
                : {
                    height: "100%",
                    width: `${fillPercent}%`,
                    backgroundColor: spec.fill,
                    transition: "width 400ms linear",
                  }
            }
          />
          {/* Skipped reads as a hatched segment rather than an empty one, so
              "never ran" is distinguishable from "not yet". */}
          {(visual === "skipped" || visual === "paused") && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  visual === "paused"
                    ? "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 6px)"
                    : "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px)",
                color: visual === "paused" ? spec.colour : "text.disabled",
                opacity: 0.6,
              }}
            />
          )}
        </Box>
        {!dense && (
          <Stack direction="row" spacing={0.25} sx={{ alignItems: "center", marginTop: 0.5, minWidth: 0 }}>
            <StepIcon sx={{ fontSize: 11, color: spec.colour, flexShrink: 0 }} />
            <Typography
              noWrap
              sx={{
                fontFamily: monoFontFamily,
                fontSize: "0.5625rem",
                letterSpacing: "0.02em",
                color: isCurrent ? "text.primary" : "text.disabled",
                fontWeight: isCurrent ? 600 : 400,
                textTransform: "lowercase",
              }}
            >
              {name}
            </Typography>
          </Stack>
        )}
      </Box>
    </Tooltip>
  );
};

/**
 * The pipeline's own outcome, for callers that need it alongside the track.
 */
export const usePipelineOutcome = (pipelineId: string) => {
  const status = useSelector(selectPipelineStatus(pipelineId));
  return status?.pipelineResult;
};
