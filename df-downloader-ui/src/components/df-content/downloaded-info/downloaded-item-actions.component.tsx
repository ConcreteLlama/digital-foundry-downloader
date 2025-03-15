import DeleteIcon from "@mui/icons-material/Delete";
import RefreshIcon from "@mui/icons-material/Refresh";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { Box, IconButton, Tooltip } from "@mui/material";
import { DfContentEntry, DfContentUpdateDownloadMetaRequest } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { API_URL } from "../../../config.ts";
import { fetchJson, postJson } from "../../../utils/fetch.ts";
import { DeleteDownloadDialog } from "./delete-download-dialog.component.tsx";
import { FetchSubtitlesDialog } from "./fetch-subtitles-dialog.component.tsx";

type DownloadedItemActionsProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

export const DownloadedItemActions = ({ contentEntry, download }: DownloadedItemActionsProps) => {
  const [subtitlesDialogOpen, setSubtitlesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const downloadIsVideo = download.mediaInfo.type === "VIDEO";

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

  const refreshDownloadMetadata = async() => {
    const requestBody: DfContentUpdateDownloadMetaRequest = {
      contentName: contentEntry.name,
      filename: download.downloadLocation,
    }
    postJson(`${API_URL}/content/downloads/update-metadata`, requestBody).catch((error) => {
      console.error("Failed to refresh metadata", error);
    });
  }
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
      <Tooltip title="Refresh Metadata" onClick={refreshDownloadMetadata}>
        <IconButton>
          <RefreshIcon />
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
