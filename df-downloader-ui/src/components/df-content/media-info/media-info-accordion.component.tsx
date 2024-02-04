import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import VideoCameraIcon from "@mui/icons-material/VideoCameraBack";
import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from "@mui/material";
import { MediaInfoListProps } from "./media-info-list.component";
import { StartDownloadingButton, getDownloadVariant } from "../start-download-dialog.component";

export const MediaInfoAccordion = ({
  contentInfo,
  mediaInfo,
  currentDownloadingType,
  downloadedContentType,
}: MediaInfoListProps) => {
  return (
    <Stack sx={{ gap: 1 }}>
      {mediaInfo.map((mediaInfo) => {
        const downloadVariant = getDownloadVariant(mediaInfo.mediaType, currentDownloadingType, downloadedContentType);
        return (
          <Accordion variant="elevation">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                <Typography>
                  {mediaInfo.mediaType} ({mediaInfo.size})
                </Typography>
                <StartDownloadingButton
                  contentInfo={contentInfo}
                  mediaType={mediaInfo.mediaType}
                  disabled={!Boolean(mediaInfo.url) || downloadVariant === "downloading"}
                  variant={downloadVariant}
                />
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
