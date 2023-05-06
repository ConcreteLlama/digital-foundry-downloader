import { useSelector } from "react-redux";
import { selectDownloadQueue } from "../../store/download-queue/download-queue.selector";
import { Stack, Typography } from "@mui/material";
import prettyBytes from "pretty-bytes";
import { QueuedContentUtils } from "df-downloader-common";

export const CumulativeDownloadInfo = () => {
  const downloadQueue = useSelector(selectDownloadQueue);
  const { bytesPerSecond, totalBytes, totalBytesDownloaded } = QueuedContentUtils.getCumulativeStats(downloadQueue);
  return downloadQueue.length > 0 ? (
    <Stack>
      <Typography align="center">{downloadQueue.length} items in queue</Typography>
      <Typography align="center">
        {prettyBytes(totalBytesDownloaded)}/{prettyBytes(totalBytes)} {prettyBytes(bytesPerSecond)}/s
      </Typography>
    </Stack>
  ) : (
    <Typography align="center">Download Queue Empty</Typography>
  );
};
