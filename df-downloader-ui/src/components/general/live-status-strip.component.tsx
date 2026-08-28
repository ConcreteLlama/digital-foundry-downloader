import { Box, Stack, Typography } from "@mui/material";
import { bytesToHumanReadable, TaskPipelineUtils } from "df-downloader-common";
import { useSelector } from "react-redux";
import {
  selectDownloadingPipelineIds,
  selectPipelinesFromIds,
  selectPostProcessingPipelineIds,
} from "../../store/df-tasks/tasks.selector";
import { monoFontFamily } from "../../themes/build-theme";
import { QueueStatusIndicator } from "./queue-status-indicator.component";

/**
 * What the app is doing right now, in the top bar.
 *
 * Replaces two widgets that sat loose in the bar with nothing tying them
 * together - a "N tasks" block and the queue icon. The counts are prose, the
 * figures are mono and tabular so a changing transfer rate doesn't make the
 * strip jitter, and when nothing is running it says so quietly rather than
 * occupying the same space with the same weight.
 */
export const LiveStatusStrip = () => {
  const downloadingIds = useSelector(selectDownloadingPipelineIds);
  const downloadingPipelines = useSelector(selectPipelinesFromIds(downloadingIds));
  const postProcessingIds = useSelector(selectPostProcessingPipelineIds);
  const { bytesPerSecond, totalBytes, totalBytesDownloaded } =
    TaskPipelineUtils.getCumulativeDownloadStats(downloadingPipelines);

  const parts: string[] = [];
  if (downloadingIds.length > 0) {
    parts.push(`${downloadingIds.length} downloading`);
  }
  if (postProcessingIds.length > 0) {
    parts.push(`${postProcessingIds.length} processing`);
  }
  const idle = parts.length === 0;

  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        {/* A dot, so "something is happening" survives at a glance and in greyscale. */}
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor: idle ? "transparent" : "primary.main",
            border: idle ? "1.5px solid" : "none",
            borderColor: "text.disabled",
          }}
        />
        <Typography
          noWrap
          sx={{ fontSize: "0.75rem", color: idle ? "text.disabled" : "text.secondary" }}
        >
          {idle ? "idle" : parts.join(" · ")}
        </Typography>
      </Stack>
      {downloadingIds.length > 0 && (
        <Typography
          noWrap
          sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.secondary" }}
        >
          {bytesToHumanReadable(totalBytesDownloaded)}/{bytesToHumanReadable(totalBytes)}
          {"  "}
          {bytesToHumanReadable(bytesPerSecond)}/s
        </Typography>
      )}
      <QueueStatusIndicator />
    </Stack>
  );
};
