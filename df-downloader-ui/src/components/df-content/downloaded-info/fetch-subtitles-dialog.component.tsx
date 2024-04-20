import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Typography,
} from "@mui/material";
import { DfContentEntry, GenerateSubtitlesRequest } from "df-downloader-common";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { API_URL } from "../../../config.ts";
import { selectSubtitlesIcon } from "../../../icons/utils.ts";
import { queryConfigSection } from "../../../store/config/config.action.ts";
import { selectConfigLoading, selectConfigSection } from "../../../store/config/config.selector.ts";
import { postJson } from "../../../utils/fetch.ts";
import { Loading } from "../../general/loading.component.tsx";
import { DownloadSummaryGrid } from "./download-summary-grid.component.tsx";

type FetchSubtitlesDialogProps = {
  open: boolean;
  onClose: () => void;
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

export const FetchSubtitlesDialog = (props: FetchSubtitlesDialogProps) => {
  const { open, onClose, contentEntry, download } = props;
  const dispatch = useDispatch();
  useEffect(() => {
    if (open) {
      dispatch(queryConfigSection.start("subtitles"));
    }
  }, [dispatch, open]);

  const subtitlesConfig = useSelector(selectConfigSection("subtitles"));
  const configLoading = useSelector(selectConfigLoading);
  const availableServices = subtitlesConfig?.servicePriorities || [];
  const noServices = !availableServices.length;

  const [selectedService, setSelectedService] = useState<SubtitlesService>(availableServices[0] || "");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  const [sendingRequest, setSendingRequest] = useState(false);

  const fetchSubs = () => {
    setSendingRequest(true);
    const fetchSubtitlesRequest: GenerateSubtitlesRequest = {
      dfContentName: contentEntry.name,
      mediaFilePath: download.downloadLocation,
      subtitlesService: selectedService,
      language: selectedLanguage as any,
    };
    postJson(`${API_URL}/subtitles/generate`, fetchSubtitlesRequest)
      .then(() => {
        setSendingRequest(false);
        onClose();
      })
      .catch((error) => {
        console.error("Failed to fetch subtitles", error);
        setSendingRequest(false);
      });
  };

  const serviceSelectChangeHandler = (event: SelectChangeEvent) => {
    const { value } = event.target;
    setSelectedService(value as SubtitlesService);
  };

  const languageSelectChangeHandler = (event: SelectChangeEvent) => {
    const { value } = event.target;
    setSelectedLanguage(value);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Fetch Subtitles</DialogTitle>
      <DialogContent>
        {configLoading ? (
          <Loading />
        ) : noServices ? (
          <Typography>No subtitle services configured</Typography>
        ) : (
          <Stack>
            <Typography>Fetch subtitles for the following download:</Typography>
            <DownloadSummaryGrid contentEntry={contentEntry} download={download} sx={{ marginLeft: 2, marginY: 2 }} />
            <Stack gap={3}>
              <FormControl>
                <InputLabel id="service-select-label">Service</InputLabel>
                <Select onChange={serviceSelectChangeHandler} value={selectedService || ""} label="Service">
                  {availableServices.map((service) => {
                    const SubtitleServiceIcon = selectSubtitlesIcon(service);
                    return (
                      <MenuItem value={service}>
                        <Box sx={{ display: "flex", flexDirection: "row", gap: "0.5rem" }}>
                          {<SubtitleServiceIcon />}
                          {service}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
              <FormControl>
                <InputLabel id="language-select-label">Language</InputLabel>
                <Select
                  onChange={languageSelectChangeHandler}
                  value={selectedLanguage || ""}
                  labelId="language-select-label"
                >
                  <MenuItem value="en">English</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={fetchSubs}
          disabled={noServices || configLoading || !selectedService || !selectedLanguage || sendingRequest}
        >
          {sendingRequest ? "Starting Fetch..." : "Fetch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
