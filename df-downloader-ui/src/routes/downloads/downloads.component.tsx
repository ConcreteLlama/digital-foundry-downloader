import AddIcon from "@mui/icons-material/Add";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { controlAllTasks } from "../../api/tasks.ts";
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
  const runBulk = async (action: "pause" | "resume") => {
    setBulkBusy(true);
    try {
      const { affected, skipped } = await controlAllTasks(action);
      if (!affected && !skipped) {
        triggerSnackbar(`Nothing running to ${action}`, { variant: "info" });
      } else if (!affected) {
        // Everything running was of a kind that cannot stop where it is, which
        // is worth saying plainly rather than reporting "paused 0".
        triggerSnackbar(
          `Nothing could be ${action}d - ${skipped} running ${skipped === 1 ? "task does" : "tasks do"} not support it`,
          { variant: "warning" }
        );
      } else {
        triggerSnackbar(
          `${action === "pause" ? "Paused" : "Resumed"} ${affected} ${affected === 1 ? "task" : "tasks"}` +
            (skipped ? ` - ${skipped} could not be ${action}d` : ""),
          { variant: skipped ? "warning" : "success" }
        );
      }
    } catch (e) {
      triggerSnackbar(e instanceof Error ? e.message : `Could not ${action} everything`, { variant: "error" });
    } finally {
      setBulkBusy(false);
    }
  };
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
      <Typography variant="overline">Queue</Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Tooltip title="Pause everything that can be paused">
          <span>
            <IconButton size="small" disabled={bulkBusy} onClick={() => void runBulk("pause")} aria-label="Pause all">
              <PauseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Resume everything that was paused">
          <span>
            <IconButton size="small" disabled={bulkBusy} onClick={() => void runBulk("resume")} aria-label="Resume all">
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
