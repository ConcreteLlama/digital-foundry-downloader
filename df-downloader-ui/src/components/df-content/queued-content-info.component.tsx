import { DownloadProgressUtils, QueuedContent, QueuedContentStatus, QueuedContentUtils } from "df-downloader-common";
import prettyMs from "pretty-ms";
import { Box, Typography } from "@mui/material";
import prettyBytes from "pretty-bytes";
import { DfDownloadProgressBar } from "../downloads/download-progress-bar.component";

export type QueuedContentComponentProps = {
  queuedContent: QueuedContent;
};

//Queued content status
/*
  QUEUED = "QUEUED",
  PENDING_RETRY = "PENDING_RETRY",
  DOWNLOADING = "DOWNLOADING",
  POST_PROCESSING = "POST_PROCESSING",
  DONE = "DONE",
  */
// All need status label
// Queued - % complete, position in queue (not currently available),
// Pending Retry - % complete, current retry count
// Downloading - % complete, speed, attempt number if > 1
// Post Processing - % complete, current step (label)

export const QueuedContentDetail = ({ queuedContent }: QueuedContentComponentProps) => {
  return (
    <Box>
      {queuedContent.queuedContentStatus === QueuedContentStatus.QUEUED ? (
        <QueuedContentDetailQueued queuedContent={queuedContent} />
      ) : queuedContent.queuedContentStatus === QueuedContentStatus.PENDING_RETRY ? (
        <QueuedContentDetailPendingRetry queuedContent={queuedContent} />
      ) : queuedContent.queuedContentStatus === QueuedContentStatus.DOWNLOADING ? (
        <QueuedContentDetailDownloading queuedContent={queuedContent} />
      ) : queuedContent.queuedContentStatus === QueuedContentStatus.POST_PROCESSING ? (
        <QueuedContentDetailPostProcessing queuedContent={queuedContent} />
      ) : (
        <Typography>ERROR: Unrecognized queue status {queuedContent.queuedContentStatus}</Typography>
      )}
    </Box>
  );
};

const QueuedContentDetailQueued = ({ queuedContent }: QueuedContentComponentProps) => {
  // In future may be able to pop item out of downloading and back into queue, so % complete is relevant
  return (
    <Box>
      <DfDownloadProgressBar queuedContent={queuedContent} />
    </Box>
  );
};

const QueuedContentDetailPendingRetry = ({ queuedContent }: QueuedContentComponentProps) => {
  return (
    <Box>
      <DfDownloadProgressBar queuedContent={queuedContent} />
      <Typography align="center">{queuedContent.currentAttempt}</Typography>
    </Box>
  );
};

const QueuedContentDetailDownloading = ({ queuedContent }: QueuedContentComponentProps) => {
  const progress = QueuedContentUtils.getCurrentStats(queuedContent);
  return (
    <Box>
      <DfDownloadProgressBar queuedContent={queuedContent} />
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography>{prettyBytes(progress?.bytesPerSecond || 0)}/s</Typography>
        <Typography>
          {`${prettyBytes(progress?.totalBytesDownloaded || 0)}/${prettyBytes(progress?.totalBytes || 0)}`}
        </Typography>
        <Typography>
          {`${
            progress
              ? prettyMs(DownloadProgressUtils.calculateTimeRemainingSeconds(progress) * 1000, {
                  secondsDecimalDigits: 0,
                })
              : "unknown"
          } remaining${progress?.retries ? ` (attempt ${progress.retries + 1})` : ""}`}
        </Typography>
      </Box>
    </Box>
  );
};

const QueuedContentDetailPostProcessing = ({ queuedContent }: QueuedContentComponentProps) => {
  return (
    <Box>
      <DfDownloadProgressBar queuedContent={queuedContent} />
      <Typography align="center">{queuedContent.statusInfo}</Typography>
    </Box>
  );
};

export const QueuedContentSummary = ({ queuedContent }: QueuedContentComponentProps) => {
  return (
    <Box>
      {queuedContent.queuedContentStatus === QueuedContentStatus.DOWNLOADING ? (
        <DfDownloadProgressBar queuedContent={queuedContent} />
      ) : queuedContent.queuedContentStatus === QueuedContentStatus.POST_PROCESSING ? (
        <Typography>Post Processing: {queuedContent.statusInfo}</Typography>
      ) : (
        <Typography>{queuedContent.queuedContentStatus}</Typography>
      )}
    </Box>
  );
};
