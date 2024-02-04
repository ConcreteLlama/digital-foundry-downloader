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
import DownloadingIcon from "@mui/icons-material/Downloading";
import DownloadedIcon from "@mui/icons-material/DownloadDone";
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
  variant?: "downloading" | "downloaded" | "available";
};

export const getDownloadVariant = (
  mediaType: string,
  currentDownloadingType?: string,
  downloadedContentType?: string
) => {
  if (mediaType === currentDownloadingType) {
    return "downloading";
  } else if (mediaType === downloadedContentType) {
    return "downloaded";
  } else {
    return "available";
  }
};

const selectDownloadIcon = (variant: "downloading" | "downloaded" | "available") => {
  switch (variant) {
    case "downloading":
      return DownloadingIcon;
    case "downloaded":
      return DownloadedIcon;
    case "available":
      return DownloadIcon;
  }
};

export const StartDownloadingButton = ({
  contentInfo,
  mediaType,
  label,
  disabled,
  variant = "available",
}: StartDownloadButtonProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const VariantIcon = selectDownloadIcon(variant);
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
          <VariantIcon fontSize="small" />
        </Box>
      ) : (
        <IconButton onClick={() => setDialogOpen(true)} disabled={disabled}>
          <VariantIcon fontSize="small" />
        </IconButton>
      )}
    </Fragment>
  );
};
