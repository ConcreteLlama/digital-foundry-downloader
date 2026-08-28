import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { Box, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from "@mui/material";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { TaskList } from "../../components/tasks/task-list.component.tsx";
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
        background: "background.default",
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
  const maxConcurrentDownloads = downloadsConfig?.maxSimultaneousDownloads;
  const setMaxConcurrentDownloads = (newVal: number) => {
    dispatch(
      updateConfigSection.start({
        section: "downloads",
        value: {
          ...downloadsConfig,
          maxSimultaneousDownloads: newVal,
        },
      })
    );
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
      <ConcurrencyStepper value={maxConcurrentDownloads} onChange={setMaxConcurrentDownloads} />
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
