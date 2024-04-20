import { Stack, Typography } from "@mui/material";
import { DfContentEntry, DfContentEntryUtils, DfContentStatus } from "df-downloader-common";
import { useState } from "react";
import { useSelector } from "react-redux";
import { fetchSingleDfContentEntry } from "../../store/df-content/df-content.action";
import { selectActivePipelineIdsForContent } from "../../store/df-tasks/tasks.selector";
import { store } from "../../store/store";
import { DownloadedContentSummary } from "./downloaded-content-info.component";
import { PipelineInfoSummary } from "./queued-task-info";
import { StartDownloadingButton } from "./start-download-dialog.component";

export type DfContentStatusSummaryProps = {
  content: DfContentEntry;
};

export const DfContentStatusSummary = ({ content }: DfContentStatusSummaryProps) => {
  const pipelineIds = useSelector(selectActivePipelineIdsForContent(content.name));
  const downloadExists = Boolean(pipelineIds);
  const [prevDownloadExists, setPrevDownloadExists] = useState(downloadExists);
  if (downloadExists !== prevDownloadExists) {
    setPrevDownloadExists(downloadExists);
    store.dispatch(fetchSingleDfContentEntry.start(content.name));
  }
  if (pipelineIds.length > 0) {
    return (
      <Stack
        sx={{
          width: "100%",
        }}
      >
        {pipelineIds.map((pipelineId) => (
          <PipelineInfoSummary pipelineId={pipelineId} />
        ))}
      </Stack>
    );
  } else {
    const statusInfo = content.statusInfo;
    const status = statusInfo.status;
    if (DfContentEntryUtils.hasDownload(content)) {
      return <DownloadedContentSummary content={content} />;
    } else if (statusInfo.status === DfContentStatus.PAYWALLED) {
      return <Typography>Paywalled</Typography>;
    } else if (status === DfContentStatus.AVAILABLE) {
      return <StartDownloadingButton contentEntry={content} label="Available" />;
    }
  }
  return <span>ERROR</span>;
};
