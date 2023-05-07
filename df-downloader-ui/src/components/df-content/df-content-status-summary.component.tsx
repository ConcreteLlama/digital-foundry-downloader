import { Typography } from "@mui/material";
import { DfContentEntry, DfContentStatus } from "df-downloader-common";
import { useState } from "react";
import { useSelector } from "react-redux";
import { fetchSingleDfContentEntry } from "../../store/df-content/df-content.action";
import { selectDownloadItem } from "../../store/download-queue/download-queue.selector";
import { store } from "../../store/store";
import { isDownloadedContentStatus, isPaywalledContentStatus } from "../../utils/types";
import { DownloadedContentSummary } from "./downloaded-content-info.component";
import { QueuedContentSummary } from "./queued-content-info.component";
import { StartDownloadingButton } from "./start-download-dialog.component";

export type DfContentStatusSummaryProps = {
  content: DfContentEntry;
};

export const DfContentStatusSummary = ({ content }: DfContentStatusSummaryProps) => {
  const downloadStatus = useSelector(selectDownloadItem(content.name));
  const downloadExists = Boolean(downloadStatus);
  const [prevDownloadExists, setPrevDownloadExists] = useState(downloadExists);
  if (downloadExists !== prevDownloadExists) {
    //TODO: It may be better to create a fn that lists items added to or removed from the download queue
    //then use that to trigger a refetch of the content infos. We can then apply that higher up the tree
    setPrevDownloadExists(downloadExists);
    store.dispatch(fetchSingleDfContentEntry.start(content.name));
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
      return <StartDownloadingButton contentInfo={content.contentInfo} label="Available" />;
    }
  }
  return <span>ERROR</span>;
};
