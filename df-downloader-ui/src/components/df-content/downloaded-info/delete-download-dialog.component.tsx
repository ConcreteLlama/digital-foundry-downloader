import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DeleteDownloadRequest, DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { API_URL } from "../../../config.ts";
import { fetchSingleDfContentEntry } from "../../../store/df-content/df-content.action.ts";
import { postJson } from "../../../utils/fetch.ts";
import { DownloadSummaryGrid } from "./download-summary-grid.component.tsx";

type DeleteDownloadDialogProps = {
  open: boolean;
  onClose: () => void;
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

export const DeleteDownloadDialog = (props: DeleteDownloadDialogProps) => {
  const dispatch = useDispatch();
  const { open, onClose, contentEntry, download } = props;
  const [deleting, setDeleting] = useState(false);
  const deleteDownload = (contentEntry: DfContentEntry, download: DfContentDownloadInfo) => {
    setDeleting(true);
    const deleteDownloadRequest: DeleteDownloadRequest = {
      contentName: contentEntry.name,
      downloadLocation: download.downloadLocation,
    };
    postJson(`${API_URL}/content/delete-download`, deleteDownloadRequest)
      .then(() => {
        setDeleting(false);
        onClose();
        dispatch(fetchSingleDfContentEntry.start(contentEntry.name));
      })
      .catch((error) => {
        console.error("Error deleting download", error);
        setDeleting(false);
      });
  };
  return (
    <Dialog open={open} onClose={onClose} id="delete-download-dialog">
      <DialogTitle>Delete Download</DialogTitle>
      <DialogContent>
        <DialogContentText>
          <Stack>
            Are you sure you want to delete the following item:
            <DownloadSummaryGrid contentEntry={contentEntry} download={download} sx={{ marginLeft: 2, marginTop: 2 }} />
          </Stack>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={deleting} onClick={() => deleteDownload(contentEntry, download)}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
