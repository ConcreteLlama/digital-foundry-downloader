import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { useState } from "react";
import { startManualDownload } from "../../store/df-tasks/tasks.action";
import { store } from "../../store/store";
import { ManualDownloadTab, ManualDownloadData } from "./manual-download-tab.component";

export type ContentImportDialogProps = {
  open: boolean;
  onClose: () => void;
};

export const ContentImportDialog = ({
  open,
  onClose,
}: ContentImportDialogProps) => {
  const [downloadData, setDownloadData] = useState<ManualDownloadData>({
    url: "",
    title: "",
    description: "",
    publishedDate: "",
    tags: [],
    mediaFormat: "",
    youtubeUrl: "",
  });

  const handleManualDownloadSubmit = () => {
    if (!downloadData.url || !downloadData.title) {
      return;
    }

    store.dispatch(
      startManualDownload.start({
        url: downloadData.url,
        title: downloadData.title,
        description: downloadData.description,
        publishedDate: downloadData.publishedDate || new Date().toISOString(),
        tags: downloadData.tags,
        mediaFormat: downloadData.mediaFormat,
        youtubeUrl: downloadData.youtubeUrl,
      })
    );

    // Reset form
    setDownloadData({
      url: "",
      title: "",
      description: "",
      publishedDate: "",
      tags: [],
      mediaFormat: "",
      youtubeUrl: "",
    });
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>Manual Download</DialogTitle>
      <DialogContent>
        <ManualDownloadTab
          data={downloadData}
          onChange={setDownloadData}
          onSubmit={handleManualDownloadSubmit}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleManualDownloadSubmit}
          variant="contained"
          disabled={!downloadData.url || !downloadData.title}
        >
          Start Download
        </Button>
      </DialogActions>
    </Dialog>
  );
};
