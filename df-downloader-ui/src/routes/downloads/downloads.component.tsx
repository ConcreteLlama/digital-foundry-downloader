import AddIcon from "@mui/icons-material/Add";
import PauseIcon from "@mui/icons-material/Pause";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RemoveIcon from "@mui/icons-material/Remove";
import {
  Alert, Box, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { controlAllTasks } from "../../api/tasks.ts";
import { BasicDialog } from "../../components/general/basic-dialog.component.tsx";
import { TaskList } from "../../components/tasks/task-list.component.tsx";
import { triggerSnackbar } from "../../utils/snackbar.tsx";
import { queryConfigSection, updateConfigSection } from "../../store/config/config.action.ts";
import { selectConfigSection } from "../../store/config/config.selector.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { DownloadsPageContainer } from "./downloads.styles";

const MIN_CONCURRENT = 1;
const MAX_CONCURRENT = 10;

export const DownloadsPage = () => {
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <DownloadsPageContainer
      id="download-page-container"
      sx={{
        bgcolor: "background.default",
        maxWidth: belowMd ? "100vw" : "65vw",
      }}
    >
      <DownloadsPageHeader />
      <TaskList />
    </DownloadsPageContainer>
  );
};

const DownloadsPageHeader = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(queryConfigSection.start("downloads"));
  }, []);
  const downloadsConfig = useSelector(selectConfigSection("downloads"))!;
  const savedValue = downloadsConfig?.maxSimultaneousDownloads;

  // Clicking + three times used to drop increments: each click read the value
  // from the last round-trip, so all three computed the same "current + 1".
  // A local pending value makes the stepper responsive and correct, and the
  // write is debounced so a burst of clicks rewrites config.yaml once.
  const [pending, setPending] = useState<number | undefined>(undefined);
  const configRef = useRef(downloadsConfig);
  configRef.current = downloadsConfig;
  const writeTimer = useRef<ReturnType<typeof setTimeout>>();
  const maxConcurrentDownloads = pending ?? savedValue;

  useEffect(() => {
    // Once the server echoes the value back, stop overriding it locally.
    if (pending !== undefined && savedValue === pending) {
      setPending(undefined);
    }
  }, [savedValue, pending]);

  useEffect(() => () => clearTimeout(writeTimer.current), []);

  const setMaxConcurrentDownloads = (newVal: number) => {
    setPending(newVal);
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      dispatch(
        updateConfigSection.start({
          section: "downloads",
          value: {
            ...configRef.current,
            maxSimultaneousDownloads: newVal,
          },
        })
      );
    }, 500);
  };
  /**
   * Pause or resume the lot.
   *
   * Best-effort by design - some running work cannot stop where it is - so
   * the result says what actually took rather than claiming everything did.
   */
  const [bulkBusy, setBulkBusy] = useState(false);
  /**
   * Confirmed first, because it reaches everything at once.
   *
   * One dialog rather than two: the wording is the only difference, and a
   * pending action reads better than a pair of booleans that must never both
   * be true.
   */
  const [pendingAction, setPendingAction] = useState<"pause" | "resume" | "stop" | null>(null);
  const runBulk = async (action: "pause" | "resume" | "stop") => {
    setBulkBusy(true);
    try {
      const { affected, skipped } = await controlAllTasks(action);
      if (action === "stop") {
        const running = skipped
          ? ` - ${skipped} already running ${skipped === 1 ? "item cannot be interrupted and will finish" : "items cannot be interrupted and will finish"}`
          : "";
        triggerSnackbar(affected ? `Stopped ${affected} queued ${affected === 1 ? "item" : "items"}${running}` : running.replace(/^ - /, "") || "Nothing to stop", {
          variant: skipped ? "warning" : affected ? "success" : "info",
        });
      } else if (action === "pause") {
        // The hold is the part that always took, so it leads. The counts are
        // about the work already in flight, which is the part that may not
        // have stopped.
        const running = skipped
          ? ` - ${skipped} already running ${skipped === 1 ? "task cannot stop" : "tasks cannot stop"} part-way and will finish`
          : "";
        triggerSnackbar(
          `Queue held${affected ? `, ${affected} paused` : ""}${running}` + (!affected && !skipped ? " - nothing was running" : ""),
          { variant: skipped ? "warning" : "success" }
        );
      } else {
        triggerSnackbar(`Queue released${affected ? `, ${affected} resumed` : ""}`, { variant: "success" });
      }
    } catch (e) {
      triggerSnackbar(e instanceof Error ? e.message : `Could not ${action} everything`, { variant: "error" });
    } finally {
      setBulkBusy(false);
    }
  };
  const confirmCopy = {
    pause: {
      title: "Pause everything",
      // Leads with the guarantee rather than the caveat: holding the queue
      // always works, and stopping work already in flight may not.
      content:
        "Nothing new will start until you resume. Anything already running that can stop where it is will pause; work that cannot be interrupted part-way - transcription in particular - finishes first, and you will be told how much that was.",
      confirmButtonText: "Pause all",
    },
    stop: {
      title: "Stop everything?",
      // The only one of the three that destroys work, so it says so plainly
      // rather than relying on the button's colour to carry the warning.
      content: (
        <Alert severity="error" variant="outlined" sx={{ marginBottom: 1 }}>
          This cancels everything queued and in progress. Anything not yet started is dropped from the queue and will
          not run; work already part-way through is lost, not paused. Nothing here can be undone - the items have to be
          queued again.
        </Alert>
      ),
      confirmButtonText: "Stop everything",
    },
    resume: {
      title: "Resume everything",
      content: "The queue starts again, in order, and anything paused resumes.",
      confirmButtonText: "Resume all",
    },
  } satisfies Record<string, { title: string; content: React.ReactNode; confirmButtonText: string }>;
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
        paddingX: { xs: 1, md: 1 },
        paddingBottom: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <BasicDialog
        id="control-all-dialog"
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        title={pendingAction ? confirmCopy[pendingAction].title : ""}
        content={pendingAction ? confirmCopy[pendingAction].content : ""}
        confirmButtonText={pendingAction ? confirmCopy[pendingAction].confirmButtonText : ""}
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          if (action) {
            void runBulk(action);
          }
        }}
      />
      <Typography variant="overline">Queue</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Tooltip title="Pause everything that can be paused">
          <span>
            <IconButton size="small" disabled={bulkBusy} onClick={() => setPendingAction("pause")} aria-label="Pause all">
              <PauseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Stop everything, queued and running">
          <span>
            <IconButton
              size="small"
              color="error"
              disabled={bulkBusy}
              onClick={() => setPendingAction("stop")}
              aria-label="Stop all"
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Resume everything that was paused">
          <span>
            <IconButton size="small" disabled={bulkBusy} onClick={() => setPendingAction("resume")} aria-label="Resume all">
              <PlayArrowIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <ConcurrencyStepper value={maxConcurrentDownloads} onChange={setMaxConcurrentDownloads} />
      </Stack>
    </Box>
  );
};

type ConcurrencyStepperProps = {
  value?: number;
  onChange: (newValue: number) => void;
};

/**
 * A stepper rather than the floating 5rem Select it replaces.
 *
 * The value only ever moves by one, and it lives between 1 and 10 - a dropdown
 * of ten identical numbers was a menu to answer a question that has two
 * buttons' worth of range.
 */
const ConcurrencyStepper = ({ value, onChange }: ConcurrencyStepperProps) => {
  const disabled = value === undefined;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Typography
        sx={{
          fontSize: "0.5625rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "text.disabled",
          marginRight: 0.5,
        }}
      >
        Concurrent
      </Typography>
      <Tooltip title="One fewer at a time">
        <span>
          <IconButton
            size="small"
            disabled={disabled || value <= MIN_CONCURRENT}
            onClick={() => onChange(Math.max((value ?? MIN_CONCURRENT) - 1, MIN_CONCURRENT))}
            aria-label="Decrease concurrent downloads"
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        sx={{
          fontFamily: monoFontFamily,
          fontSize: "0.875rem",
          fontWeight: 600,
          minWidth: 20,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value ?? "-"}
      </Typography>
      <Tooltip title="One more at a time">
        <span>
          <IconButton
            size="small"
            disabled={disabled || value >= MAX_CONCURRENT}
            onClick={() => onChange(Math.min((value ?? MIN_CONCURRENT) + 1, MAX_CONCURRENT))}
            aria-label="Increase concurrent downloads"
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};
