import DeleteIcon from "@mui/icons-material/Delete";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { Box, IconButton, Tooltip } from "@mui/material";
import { DfContentEntry, isVideoFormat } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { DeleteDownloadDialog } from "./delete-download-dialog.component.tsx";
import { FetchSubtitlesDialog } from "./fetch-subtitles-dialog.component.tsx";

type DownloadedItemActionsProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

export const DownloadedItemActions = ({ contentEntry, download }: DownloadedItemActionsProps) => {
  const [subtitlesDialogOpen, setSubtitlesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const downloadIsVideo = isVideoFormat(download.format);

  const openSubtitlesDialog = () => {
    setSubtitlesDialogOpen(true);
  };
  const closeSubtitlesDialog = () => {
    setSubtitlesDialogOpen(false);
  };
  const openDeleteDialog = () => {
    setDeleteDialogOpen(true);
  };
  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
  };
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: "0.5rem",
      }}
    >
      <Tooltip title={downloadIsVideo ? "Fetch Subtitles" : "Cannot fetch subtitles for non-video media"}>
        <IconButton onClick={openSubtitlesDialog} disabled={!downloadIsVideo}>
          <SubtitlesIcon />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete" onClick={openDeleteDialog}>
        <IconButton>
          <DeleteIcon />
        </IconButton>
      </Tooltip>
      <DeleteDownloadDialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        contentEntry={contentEntry}
        download={download}
      />
      <FetchSubtitlesDialog
        open={subtitlesDialogOpen}
        onClose={closeSubtitlesDialog}
        contentEntry={contentEntry}
        download={download}
      />
    </Box>
  );
};
