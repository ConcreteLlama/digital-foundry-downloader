import { Stack, Typography } from "@mui/material";
import { TaskPipelineUtils, bytesToHumanReadable } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectDownloadingPipelineIds,
  selectPipelinesFromIds,
  selectPostProcessingPipelineIds,
} from "../../store/df-tasks/tasks.selector.ts";

export const CumulativeDownloadInfo = () => {
  const downloadTaskPipelineIds = useSelector(selectDownloadingPipelineIds);
  const downloadingPipelines = useSelector(selectPipelinesFromIds(downloadTaskPipelineIds));
  const postProcessingTaskPipelineIds = useSelector(selectPostProcessingPipelineIds);
  const { bytesPerSecond, totalBytes, totalBytesDownloaded } =
    TaskPipelineUtils.getCumulativeDownloadStats(downloadingPipelines);
  const totalQueuedPipelines = downloadingPipelines.length + postProcessingTaskPipelineIds.length;
  const downloadingTaskInfo =
    downloadTaskPipelineIds.length > 0
      ? `${bytesToHumanReadable(totalBytesDownloaded)}/${bytesToHumanReadable(totalBytes)} ${bytesToHumanReadable(
          bytesPerSecond
        )}/s`
      : "No downloading tasks";
  return totalQueuedPipelines > 0 ? (
    <Stack>
      <Typography align="center">{totalQueuedPipelines} tasks</Typography>
      <Typography align="center">{downloadingTaskInfo}</Typography>
    </Stack>
  ) : (
    <Typography align="center">No Tasks</Typography>
  );
};
