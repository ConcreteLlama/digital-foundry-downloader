import DownloadIcon from "@mui/icons-material/Download";
import { Box, MenuItem, Select, SelectChangeEvent, useMediaQuery } from "@mui/material";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { TaskList } from "../../components/tasks/task-list.component.tsx";
import { queryConfigSection, updateConfigSection } from "../../store/config/config.action.ts";
import { selectConfigSection } from "../../store/config/config.selector.ts";
import { queryTasks } from "../../store/df-tasks/tasks.action";
import { store } from "../../store/store";
import { theme } from "../../themes/theme.ts";
import { setIntervalImmediate } from "../../utils/timer";
import { DownloadsPageContainer } from "./downloads.styles";

export const DownloadsPage = () => {
  useEffect(() => {
    const interval = setIntervalImmediate(() => {
      store.dispatch(queryTasks.start());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <DownloadsPageContainer
      id="download-page-container"
      style={{
        background: theme.palette.background.default,
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
        flexDirection: "row",
        justifyContent: "right",
        paddingX: "0.5rem",
      }}
    >
      <MaxDownloadsInput
        maxConcurrentDownloads={maxConcurrentDownloads}
        setMaxConcurrentDownloads={setMaxConcurrentDownloads}
      />
    </Box>
  );
};

type MaxDownloadsInputProps = {
  maxConcurrentDownloads: number;
  setMaxConcurrentDownloads: (newValue: number) => void;
};
const MaxDownloadsInput = ({ maxConcurrentDownloads, setMaxConcurrentDownloads }: MaxDownloadsInputProps) => {
  const handleChangeEvent = (event: SelectChangeEvent<string>) => {
    setMaxConcurrentDownloads(parseInt(event.target.value));
  };
  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <DownloadIcon />
      <Select
        value={`${maxConcurrentDownloads || ""}`}
        disabled={maxConcurrentDownloads === undefined}
        onChange={handleChangeEvent}
        sx={{ width: "5rem", marginLeft: "1rem" }}
        variant="outlined"
        size="small"
      >
        {[...Array(10)].map((_, i) => (
          <MenuItem key={i} value={i + 1}>
            {i + 1}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
};
