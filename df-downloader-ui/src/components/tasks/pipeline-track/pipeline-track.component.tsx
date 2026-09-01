import { useAnimateAfterReveal } from "../../../hooks/use-animate-after-reveal.ts";
import BlockIcon from "@mui/icons-material/Block";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, Stack, SvgIconProps, Tooltip, Typography } from "@mui/material";
import { useSelector } from "react-redux";
import { selectPipeline } from "../../../store/df-tasks/tasks.selector";
import { monoFontFamily } from "../../../themes/build-theme";
import {
  derivePipelineStepViews,
  isHiddenOnTrack,
  PipelineStepView,
  PipelineStepVisualState,
} from "./pipeline-step-state";
import { stepWidthPercents } from "./step-weights";

/**
 * How a step is drawn.
 *
 * Same rule as the library row: never colour alone. The old stepper varied its
 * icon by STEP and its colour by STATE, so active, failed and skipped were
 * separated by hue and nothing else. Here the step's identity is its label and
 * position, which frees the icon to carry state - and the segment fill carries
 * it a third time.
 */
export const STEP_SPECS: Record<
  PipelineStepVisualState,
  { colour: string; icon: React.FC<SvgIconProps>; fill: string }
> = {
  done: { colour: "success.main", icon: CheckIcon, fill: "success.main" },
  carried_over: { colour: "success.main", icon: HistoryIcon, fill: "success.main" },
  running: { colour: "primary.main", icon: PlayArrowIcon, fill: "primary.main" },
  paused: { colour: "text.secondary", icon: PauseIcon, fill: "text.secondary" },
  failed: { colour: "error.main", icon: CloseIcon, fill: "error.main" },
  cancelled: { colour: "text.disabled", icon: BlockIcon, fill: "text.disabled" },
  skipped: { colour: "text.disabled", icon: BlockIcon, fill: "transparent" },
  not_applicable: { colour: "text.disabled", icon: RemoveIcon, fill: "transparent" },
  pending: { colour: "text.disabled", icon: RadioButtonUncheckedIcon, fill: "transparent" },
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
 * This is the same information in ~30px: one segment per step, sized by how
 * much of the work it represents, with the running one filling to its own
 * progress rather than just being marked "current". A failed pipeline keeps
 * its whole track, so which step died and which never ran stays visible.
 *
 * Steps known in advance not to run are hidden here and shown, dimmed, in the
 * details dialog. Both views share one derivation and differ only in that
 * filter - deriving state twice is what made the dialog call every future step
 * "skipped" while the track correctly called it pending.
 */
export const PipelineTrack = ({ pipelineId, activePercent, dense }: PipelineTrackProps) => {
  const pipeline = useSelector(selectPipeline(pipelineId));
  if (!pipeline) {
    return null;
  }
  const views = derivePipelineStepViews(pipeline).filter((view) => !isHiddenOnTrack(view));
  if (views.length === 0) {
    return null;
  }
  // Over the visible subset, so hidden steps don't silently consume width.
  const widths = stepWidthPercents(views.map((view) => view.name));

  return (
    <Stack direction="row" spacing={0.5} sx={{ width: "100%" }}>
      {views.map((view, index) => (
        <TrackSegment
          key={view.stepId}
          view={view}
          widthPercent={widths[index]}
          activePercent={activePercent}
          dense={dense}
        />
      ))}
    </Stack>
  );
};

type TrackSegmentProps = {
  view: PipelineStepView;
  widthPercent: number;
  activePercent?: number;
  dense?: boolean;
};

const TrackSegment = ({ view, widthPercent, activePercent, dense }: TrackSegmentProps) => {
  const animate = useAnimateAfterReveal();
  const { state, name, task } = view;
  const spec = STEP_SPECS[state];
  const StepIcon = spec.icon;
  const message = task?.status?.message;

  // Paused counts as in-progress: pausing a download at 60% used to empty its
  // bar completely, which read as "lost everything" rather than "stopped".
  const holdsProgress = state === "running" || state === "paused";
  const hasPercent = typeof activePercent === "number";
  const fillPercent =
    holdsProgress && hasPercent
      ? Math.min(Math.max(activePercent, 0), 100)
      : state === "done" || state === "carried_over" || state === "failed" || state === "cancelled"
      ? 100
      : 0;
  // A running step that cannot report a percentage would otherwise render as
  // an empty bar, indistinguishable from pending.
  const indeterminate = state === "running" && !hasPercent;

  const tooltip = view.reason
    ? `${name} - ${view.reason}`
    : message
    ? `${name} - ${message}`
    : `${name} - ${state.replace(/_/g, " ")}`;

  return (
    <Tooltip title={tooltip}>
      <Box
        tabIndex={0}
        role="img"
        aria-label={tooltip}
        // Proportional, so the track stops claiming Measure Duration is worth
        // as much as a 6GB transfer. Fixed per step type and never recomputed
        // from live progress - a segment resizing mid-download would make the
        // fill appear to jump backwards.
        sx={{
          width: `${widthPercent}%`,
          minWidth: 0,
          flexShrink: 0,
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
        }}
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
                    backgroundImage: "linear-gradient(90deg, transparent 0%, currentColor 50%, transparent 100%)",
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
                    // Suppressed for a frame when the tab is revealed, or every
                    // bar animates from where it was last painted up to where
                    // it actually is - see useAnimateAfterReveal.
                    transition: animate ? "width 400ms linear" : "none",
                  }
            }
          />
          {(state === "skipped" || state === "paused") && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  state === "paused"
                    ? "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 6px)"
                    : "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px)",
                color: state === "paused" ? spec.colour : "text.disabled",
                opacity: 0.6,
              }}
            />
          )}
        </Box>
        {!dense && (
          <Stack direction="row" spacing={0.25} sx={{ alignItems: "center", marginTop: 0.5, minWidth: 0 }}>
            <StepIcon sx={{ fontSize: 11, color: spec.colour, flexShrink: 0 }} />
            {/*
              The label is decoupled from the bar width, deliberately. A 6%
              segment cannot show "measure duration" at any size worth reading,
              and truncating every label to two or three characters is noise
              that reads as neither word nor icon. Only the step actually
              running is named; the rest are an icon plus the tooltip, and the
              segment is focusable so that tooltip is reachable without a hover
              a touch device never sends.
            */}
            {view.isCurrent && (
              <Typography
                noWrap
                sx={{
                  fontFamily: monoFontFamily,
                  fontSize: "0.5625rem",
                  letterSpacing: "0.02em",
                  color: "text.primary",
                  fontWeight: 600,
                  textTransform: "lowercase",
                }}
              >
                {name}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Tooltip>
  );
};
