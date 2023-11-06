import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { store } from "../../store/store";
import { startDownload } from "../../store/download-queue/download-queue.action";
import { Fragment, useState } from "react";
import DownloadIcon from "@mui/icons-material/Download";
import { DfContentInfo } from "df-downloader-common";

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
  contentInfo: DfContentInfo;
  mediaType?: string;
  label?: string;
  disabled?: boolean;
};

export const StartDownloadingButton = ({ contentInfo, mediaType, label, disabled }: StartDownloadButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <Fragment>
      <StartDownloadDialog
        contentInfo={contentInfo}
        mediaType={mediaType}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
      {label ? (
        <Box
          sx={{ display: "flex", alignItems: "center", cursor: "pointer", "&:hover": { color: "primary.main" } }}
          onClick={() => setDialogOpen(true)}
        >
          <Typography>Available</Typography>
          <DownloadIcon fontSize="small" />
        </Box>
      ) : (
        <IconButton onClick={() => setDialogOpen(true)} disabled={disabled}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      )}
    </Fragment>
  );
};
