import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderIcon from "@mui/icons-material/Folder";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { Accordion, AccordionDetails, AccordionSummary, Box, Stack, Typography } from "@mui/material";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { DownloadedInfoListProps } from "./downloaded-info-list.component.tsx";
import { SubtitlesInfo } from "./subtitles-info.component.tsx";
import { DownloadedItemActions } from "./downloaded-item-actions.component.tsx";
import { DfContentEntry } from "df-downloader-common";

export const DownloadedInfosAccordian = ({ contentEntry }: DownloadedInfoListProps) => {
  const { downloads } = contentEntry;
  return (
    <Stack sx={{ gap: 1 }}>
      {downloads.map((download) => (
        <DownloadedInfoAccordian download={download} contentEntry={contentEntry} />
      ))}
    </Stack>
  );
};

type DownloadedInfoAccordianProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};
const DownloadedInfoAccordian = ({ contentEntry, download }: DownloadedInfoAccordianProps) => {
  return (
    <Accordion variant="elevation">
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <Typography>
            {download.mediaInfo.format} ({download.size})
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 10fr", gap: 3, alignItems: "center" }}>
          <FolderIcon />
          <Typography>{download.downloadLocation}</Typography>
          <SubtitlesIcon />
          <SubtitlesInfo subtitles={download.subtitles || []} />
          <Typography>Actions</Typography>
          <DownloadedItemActions contentEntry={contentEntry} download={download} />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
};
