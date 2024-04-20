import { Box, Card, Typography } from "@mui/material";
import { DownloadProgressUtils, DownloadTaskInfo, bytesToHumanReadable } from "df-downloader-common";
import prettyMs from "pretty-ms";
import { useSelector } from "react-redux";
import { selectPipelineDetails } from "../../store/df-tasks/tasks.selector.ts";
import { DfDownloadProgressBar } from "../tasks/download-progress-bar.component";
import { TaskStatusDetail } from "../tasks/task-status-detail/task-status-detail.component.tsx";
import { getTaskTypeIcon } from "../tasks/task-type-icon.ts";

export type TaskComponentProps = {
  pipelineId: string;
};

export const PipelineInfoSummary = ({ pipelineId }: TaskComponentProps) => {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        height: "1.5rem",
      }}
    >
      <TaskStatusDetail pipelineId={pipelineId} />
    </Box>
  );
};

export const PipelineInfoSummaryDetail = ({ pipelineId }: TaskComponentProps) => {
  const taskDetails = useSelector(selectPipelineDetails(pipelineId));
  if (!taskDetails) {
    return <Typography>{`Task ${pipelineId} not found`}</Typography>;
  }
  const mediaType = taskDetails.mediaType;
  const startTime = taskDetails.queuedTime;
  const TaskTypeIcon = getTaskTypeIcon(taskDetails.type);
  return (
    <Card variant="outlined" sx={{ padding: "0.5rem" }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <TaskTypeIcon />
        <Typography component="div">{mediaType}</Typography>
        {startTime && (
          <Typography variant="body2" color="text.secondary">
            Started at {new Date(startTime).toLocaleString()}
          </Typography>
        )}
      </Box>
      <TaskStatusDetail pipelineId={pipelineId} />
    </Card>
  );
};

type DownloadTaskDetailComponentProps = {
  downloadTaskInfo: DownloadTaskInfo;
};
export const DownloadTaskDetail = ({ downloadTaskInfo }: DownloadTaskDetailComponentProps) => {
  const progress = downloadTaskInfo.status?.currentProgress;
  return (
    <Box>
      <Box>
        <DfDownloadProgressBar progressInfo={progress} />
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography>{bytesToHumanReadable(progress?.currentBytesPerSecond || 0)}/s</Typography>
          <Typography>
            {`${bytesToHumanReadable(progress?.totalBytesDownloaded || 0)}/${bytesToHumanReadable(
              progress?.totalBytes || 0
            )}`}
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
      </Box>{" "}
    </Box>
  );
};
