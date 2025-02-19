import DownloadIcon from "@mui/icons-material/Download";
import DownloadedIcon from "@mui/icons-material/DownloadDone";
import DownloadingIcon from "@mui/icons-material/Downloading";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import { DfContentAvailability, DfContentEntry, DfContentEntryUtils, DfContentInfo } from "df-downloader-common";
import { Fragment, useState } from "react";
import { useSelector } from "react-redux";
import { startDownload } from "../../store/df-tasks/tasks.action";
import { selectActivePipelineIdsForMediaType } from "../../store/df-tasks/tasks.selector.ts";
import { store } from "../../store/store";

export type StartDownloadDialogProps = {
  contentInfo: DfContentInfo;
  mediaType?: string;
  open: boolean;
  onClose: () => void;
};

export const StartDownloadDialog = ({ contentInfo, mediaType, open, onClose }: StartDownloadDialogProps) => {
  const dialogContentName = mediaType ? `${contentInfo.title} (${mediaType})` : contentInfo.title;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Start Download</DialogTitle>
      <DialogContent>
        <DialogContentText>{`Are you sure you want to start downloading ${dialogContentName}?`}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => {
            store.dispatch(
              startDownload.start({
                name: contentInfo.name,
                mediaType,
              })
            );
            onClose();
          }}
        >
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export type StartDownloadButtonProps = {
  contentEntry: DfContentEntry;
  mediaType?: string;
  label?: string;
  disabled?: boolean;
};

export const StartDownloadingButton = ({ contentEntry, mediaType, label, disabled }: StartDownloadButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const activePipeline = useSelector(selectActivePipelineIdsForMediaType(contentEntry.name, mediaType || ""));
  const downloadContentInfo = DfContentEntryUtils.getDownloadForFormat(contentEntry, mediaType || "");
  const availability = contentEntry.statusInfo.availability;

  let VariantIcon = DownloadIcon;
  let tooltip = "Start Download";
  let buttonDisabled = disabled || false;
  if (activePipeline.length > 0) {
    VariantIcon = DownloadingIcon;
    tooltip = "Tasks currently active, cannot download content.";
    buttonDisabled = true;
  } else if (availability === DfContentAvailability.PAYWALLED) {
    VariantIcon = DownloadIcon;
    tooltip = "Content is paywalled and cannot be downloaded.";
    buttonDisabled = true;
  }  else if (availability === DfContentAvailability.UNKNOWN) {
    VariantIcon = DownloadIcon;
    tooltip = "Content has unknown availibility and cannot be downloaded.";
    buttonDisabled = true;
  } else if (downloadContentInfo) {
    VariantIcon = DownloadedIcon;
    tooltip = "Download again";
    buttonDisabled = false;
  }
  return (
    <Fragment>
      <StartDownloadDialog
        contentInfo={contentEntry.contentInfo}
        mediaType={mediaType}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      <Tooltip title={tooltip}>
        {label ? (
          <Box
            sx={{ display: "flex", alignItems: "center", cursor: "pointer", "&:hover": { color: "primary.main" } }}
            onClick={() => setDialogOpen(true)}
          >
            <Typography>Available</Typography>
            <VariantIcon fontSize="small" />
          </Box>
        ) : (
          <div>
            <IconButton onClick={() => setDialogOpen(true)} disabled={buttonDisabled}>
              <VariantIcon fontSize="small" />
            </IconButton>
          </div>
        )}
      </Tooltip>
    </Fragment>
  );
};
