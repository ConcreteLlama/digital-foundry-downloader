import { useSelector } from "react-redux";
import { selectDownloadItem } from "../../store/download-queue/download-queue.selector";
import { isDownloadedContentStatus, isPaywalledContentStatus } from "../../utils/types";
import { DfContentEntry, DfContentStatus } from "df-downloader-common";
import { Box, Typography } from "@mui/material";
import { QueuedContentSummary } from "./queued-content-info.component";
import { DownloadedContentSummary } from "./downloaded-content-info.component";
import { useState } from "react";
import { store } from "../../store/store";
import { fetchSingleDfContentInfo } from "../../store/df-content/df-content.action";
import DownloadIcon from "@mui/icons-material/Download";
import { startDownload } from "../../store/download-queue/download-queue.action";

export type DfContentStatusSummaryProps = {
  content: DfContentEntry;
};

//Content status
/*
    AVAILABLE = "AVAILABLE",
    CONTENT_PAYWALLED = "CONTENT_PAYWALLED",
    ATTEMPTING_DOWNLOAD = "ATTEMPTING_DOWNLOAD",
    DOWNLOADED = "DOWNLOADED"
  */

export const DfContentStatusSummary = ({ content }: DfContentStatusSummaryProps) => {
  const downloadStatus = useSelector(selectDownloadItem(content.name));
  const downloadExists = Boolean(downloadStatus);
  const [prevDownloadExists, setPrevDownloadExists] = useState(downloadExists);
  if (downloadExists !== prevDownloadExists) {
    //TODO: It may be better to create a fn that lists items added to or removed from the download queue
    //then use that to trigger a refetch of the content infos. We can then apply that higher up the tree
    setPrevDownloadExists(downloadExists);
    store.dispatch(fetchSingleDfContentInfo.start(content.name));
  }
  if (downloadStatus) {
    return <QueuedContentSummary queuedContent={downloadStatus} />;
  } else {
    const statusInfo = content.statusInfo;
    const status = statusInfo.status;
    if (isDownloadedContentStatus(statusInfo)) {
      return <DownloadedContentSummary content={content} statusInfo={statusInfo} />;
    } else if (isPaywalledContentStatus(statusInfo)) {
      return <Typography>Paywalled</Typography>;
    } else if (status === DfContentStatus.ATTEMPTING_DOWNLOAD) {
      return <Typography>Attempting Download</Typography>;
    } else if (status === DfContentStatus.AVAILABLE) {
      return (
        <Box
          sx={{ display: "flex", alignItems: "center", cursor: "pointer", "&:hover": { color: "primary.main" } }}
          onClick={() =>
            store.dispatch(
              startDownload.start({
                name: content.name,
              })
            )
          }
        >
          <Typography>Available</Typography>
          <DownloadIcon fontSize="small" />
        </Box>
      );
    }
  }
  return <span>ERROR</span>;
};
