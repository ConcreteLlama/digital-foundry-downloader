import { useSelector } from "react-redux";
import { selectDownloadQueue } from "../../store/download-queue/download-queue.selector";
import { Stack, Typography } from "@mui/material";
import prettyBytes from "pretty-bytes";

export const CumulativeDownloadInfo = () => {
  const downloadQueue = useSelector(selectDownloadQueue);
  const [currentDownloadSpeed, totalDownloadSize, totalDownloaded] = downloadQueue.reduce(
    (acc, queueItem) => {
      const { currentProgress } = queueItem;
      if (currentProgress) {
        const { bytesPerSecond, totalBytes, totalBytesDownloaded } = currentProgress;
        acc[0] += bytesPerSecond;
        acc[1] += totalBytes;
        acc[2] += totalBytesDownloaded;
      }
      return acc;
    },
    [0, 0, 0]
  );
  return (
    <Stack>
      <Typography align="center">{downloadQueue.length} items in queue</Typography>
      <Typography align="center">
        {prettyBytes(totalDownloaded)}/{prettyBytes(totalDownloadSize)} {prettyBytes(currentDownloadSpeed)}/s
      </Typography>
    </Stack>
  );
};
