import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import RefreshIcon from "@mui/icons-material/Refresh";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { Box } from "@mui/material";
import { DfContentEntry, DfContentUpdateDownloadMetaRequest } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { useSelector } from "react-redux";
import { API_URL } from "../../../config.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { postJson } from "../../../utils/fetch.ts";
import { TooltipIconButton } from "../../general/tooltip-button.component.tsx";
import { DeleteDownloadDialog } from "./delete-download-dialog.component.tsx";
import { EditMetadataDialog } from "./edit-metadata-dialog.component.tsx";
import { FetchSubtitlesDialog } from "./fetch-subtitles-dialog.component.tsx";

type DownloadedItemActionsProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

export const DownloadedItemActions = ({ contentEntry, download }: DownloadedItemActionsProps) => {
  const [subtitlesDialogOpen, setSubtitlesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editMetadataDialogOpen, setEditMetadataDialogOpen] = useState(false);
  const currentActiveTaskPipelines = useSelector(selectQueryPipelineIds({
    filter: {
      contentName: contentEntry.name,
      state: 'incomplete',
    }
  }))
  const updatesDisabled = currentActiveTaskPipelines.length > 0;

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
  const openEditMetadataDialog = () => {
    setEditMetadataDialogOpen(true);
  }
  const closeEditMetadataDialog = () => {
    setEditMetadataDialogOpen(false);
  }

  const refreshDownloadMetadata = async () => {
    const requestBody: DfContentUpdateDownloadMetaRequest = {
      contentName: contentEntry.name,
      filename: download.downloadLocation,
    }
    postJson(`${API_URL}/content/downloads/update-metadata`, requestBody).catch((error) => {
      console.error("Failed to refresh metadata", error);
    });
  }

  const makeTooltip = (title: string) => {
    return updatesDisabled ? `${title} (disabled while task pipelines are running)` : title;
  }
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        gap: "0.5rem",
      }}
    >
      <TooltipIconButton tooltipTitle={downloadIsVideo ? makeTooltip("Fetch Subtitles") : "Cannot fetch subtitles for non-video media"} onClick={openSubtitlesDialog} disabled={!downloadIsVideo || updatesDisabled}>
        <SubtitlesIcon />
      </TooltipIconButton>
      <TooltipIconButton tooltipTitle={makeTooltip("Delete")} onClick={openDeleteDialog} disabled={updatesDisabled}>
        <DeleteIcon />
      </TooltipIconButton>
      <TooltipIconButton tooltipTitle={makeTooltip("Refresh Metadata")} onClick={refreshDownloadMetadata} disabled={updatesDisabled}>
        <RefreshIcon />
      </TooltipIconButton>
      <TooltipIconButton tooltipTitle={makeTooltip("Edit Metadata")} onClick={openEditMetadataDialog} disabled={updatesDisabled}>
        <EditIcon />
      </TooltipIconButton>
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
      <EditMetadataDialog
        open={editMetadataDialogOpen}
        onClose={closeEditMetadataDialog}
        contentEntry={contentEntry}
        download={download}
      />
    </Box>
  );
};
