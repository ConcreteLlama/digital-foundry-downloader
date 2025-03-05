import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import VideoCameraIcon from "@mui/icons-material/VideoCameraBack";
import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from "@mui/material";
import { StartDownloadingButton } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";
import { audioPropertiesToString, bytesToHumanReadable, videoPropertiesToString } from "df-downloader-common";

export const MediaInfoAccordion = ({ contentEntry }: MediaInfoListProps) => {
  const { contentInfo } = contentEntry;
  const { mediaInfo } = contentInfo;
  return (
    <Stack sx={{ gap: 1 }}>
      {mediaInfo.map((mediaInfo) => {
        return (
          <Accordion variant="elevation">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <Typography>
                  {mediaInfo.formatString} ({bytesToHumanReadable(mediaInfo.size || 0)})
                </Typography>
                <StartDownloadingButton contentEntry={contentEntry} mediaFormat={mediaInfo.formatString} />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 10fr", gap: 2 }}>
                <VideoCameraIcon />
                <Typography>{videoPropertiesToString(mediaInfo.videoProperties)}</Typography>
                <HeadphonesIcon />
                <Typography>{audioPropertiesToString(mediaInfo.audioProperties)}</Typography>
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
};
