import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import VideoCameraIcon from "@mui/icons-material/VideoCameraBack";
import { Accordion, AccordionDetails, AccordionSummary, Box, IconButton, Stack, Typography } from "@mui/material";
import { startDownload } from "../../../store/download-queue/download-queue.action";
import { store } from "../../../store/store";
import { MediaInfoListProps } from "./media-info-list.component";

export const MediaInfoAccordion = ({ contentName, currentDownloadingType, mediaInfo }: MediaInfoListProps) => {
  return (
    <Stack sx={{ gap: 1 }}>
      {mediaInfo.map((mediaInfo) => {
        return (
          <Accordion variant="elevation">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <Typography>
                  {mediaInfo.mediaType} ({mediaInfo.size})
                </Typography>
                <IconButton
                  sx={{ marginRight: 2 }}
                  onClick={() => {
                    store.dispatch(
                      startDownload.start({
                        name: contentName,
                        mediaType: mediaInfo.mediaType,
                      })
                    );
                  }}
                >
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 10fr", gap: 2 }}>
                <VideoCameraIcon />
                <Typography>{mediaInfo.videoEncoding}</Typography>
                <HeadphonesIcon />
                <Typography>{mediaInfo.audioEncoding}</Typography>
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Stack>
  );
};
