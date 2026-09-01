import DownloadIcon from "@mui/icons-material/Download";
import { Badge, IconButton, Stack, Tooltip } from "@mui/material";
import { bytesToHumanReadable, TaskPipelineUtils } from "df-downloader-common";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  selectActiveTaskIds,
  selectDownloadingPipelineIds,
  selectPipelinesFromIds,
  selectPostProcessingPipelineIds,
} from "../../store/df-tasks/tasks.selector";
import { QueueStatusIndicator } from "./queue-status-indicator.component";

/**
 * What the app is doing right now, as one icon.
 *
 * This was a line of prose - "idle", or "2 downloading · 3 processing", plus a
 * transfer rate - which on a phone was most of the space in the top bar, and
 * spent most of it saying "idle". The information is worth keeping, since it
 * is the fastest way to know something is running without leaving the page;
 * the word "idle" is not, because an absent badge says the same thing in no
 * space at all.
 *
 * So: a badge for the count, the detail in the tooltip, and a tap that takes
 * you to the page it is about. It matches the notification bell beside it
 * rather than being a different kind of thing in the same row.
 */
export const LiveStatusStrip = () => {
  const navigate = useNavigate();
  const downloadingIds = useSelector(selectDownloadingPipelineIds);
  const downloadingPipelines = useSelector(selectPipelinesFromIds(downloadingIds));
  const postProcessingIds = useSelector(selectPostProcessingPipelineIds);
  /*
   * Standalone tasks count too. This used to total only pipelines, so a bulk
   * backfill - which is a task driving further tasks, none of them pipelines -
   * ran to completion with the badge showing nothing at all, which reads as
   * "nothing is happening" at the exact moment the most is.
   */
  const activeTaskIds = useSelector(selectActiveTaskIds);
  const { bytesPerSecond, totalBytes, totalBytesDownloaded } =
    TaskPipelineUtils.getCumulativeDownloadStats(downloadingPipelines);

  const active = downloadingIds.length + postProcessingIds.length + activeTaskIds.length;

  const parts: string[] = [];
  if (downloadingIds.length > 0) {
    parts.push(`${downloadingIds.length} downloading`);
  }
  if (postProcessingIds.length > 0) {
    parts.push(`${postProcessingIds.length} processing`);
  }
  if (activeTaskIds.length > 0) {
    parts.push(`${activeTaskIds.length} ${activeTaskIds.length === 1 ? "task" : "tasks"} outstanding`);
  }
  if (downloadingIds.length > 0) {
    parts.push(
      `${bytesToHumanReadable(totalBytesDownloaded)}/${bytesToHumanReadable(totalBytes)} at ${bytesToHumanReadable(
        bytesPerSecond
      )}/s`
    );
  }
  // The detail that used to sit in the bar, now only when it says something.
  const title = parts.length ? parts.join(" · ") : "Nothing running - open Activity";

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
      <Tooltip title={title}>
        <IconButton size="small" onClick={() => navigate("/downloads")} aria-label={`Activity: ${title}`}>
          <Badge badgeContent={active} max={99} color="primary" invisible={active === 0}>
            <DownloadIcon
              fontSize="small"
              sx={{ color: active > 0 ? "text.secondary" : "text.disabled" }}
            />
          </Badge>
        </IconButton>
      </Tooltip>
      <QueueStatusIndicator />
    </Stack>
  );
};
