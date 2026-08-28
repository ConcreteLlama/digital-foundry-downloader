import { Box, Button, Stack, Typography, useMediaQuery,
  useTheme } from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { Image } from "mui-image";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { clearPipeline } from "../../../api/tasks.ts";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { fetchYtVideoMeta, refreshDfContentMeta } from "../../../store/df-content/df-content.action.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { formatDate } from "../../../utils/date.ts";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";
import { DfTagList } from "../df-tag-list.component.tsx";
import { DownloadedInfoList } from "../downloaded-info/downloaded-info-list.component.tsx";
import { MediaInfoList } from "../media-info/media-info-list.component.tsx";
import { PipelineInfoSummaryDetail } from "../queued-task-info.tsx";
import { ContentItemDetailContainer } from "./df-content-item-detail.styles.tsx";

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
};

export const DfContentInfoItemDetail = ({ dfContentName }: DfContentInfoItemDetailProps) => {
  const theme = useTheme();
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const dfContentEntry = useDfContentEntry(dfContentName);
  useEffect(() => {
    store.dispatch(refreshDfContentMeta.start(dfContentName));
    // Description/duration aren't in the new site's own listing data at
    // all - fetched lazily from YouTube here (dialog open), not during
    // scans, and only once per entry (the service caches the result).
    store.dispatch(fetchYtVideoMeta.start(dfContentName));
  }, [dfContentName]);
  const downloadingPipelineIds = useSelector(
    selectQueryPipelineIds({
      filter: {
        contentName: dfContentName,
        state: "downloading",
      },
    })
  );
  const postProcessingPipelineIds = useSelector(
    selectQueryPipelineIds({
      filter: {
        contentName: dfContentName,
        state: "post-processing",
      },
    })
  );
  const completedPipelineIds = useSelector(
    selectQueryPipelineIds({ filter: { contentName: dfContentName, state: "complete" } })
  );
  const pipelineIds = [...downloadingPipelineIds, ...postProcessingPipelineIds, ...completedPipelineIds];
  const clearCompletedPipelines = () => {
    completedPipelineIds.forEach((pipelineId) => {
      clearPipeline(pipelineId);
    });
  };
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  const { statusInfo } = dfContentEntry;
  const queuedContentAvailability = statusInfo.availability;
  return dfContentEntry ? (
    <ContentItemDetailContainer>
      <Typography variant="h4" align="center">
        {contentInfo.title}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "center", paddingY: belowMd ? "10px" : "30px" }}>
        {contentInfo.youtubeVideoId ? (
          <YouTubeEmbed videoId={contentInfo.youtubeVideoId} width={belowMd ? "90%" : "70%"} />
        ) : (
          <Image
            src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)}
            width={belowMd ? "90%" : "70%"}
          ></Image>
        )}
      </Box>
      <DfTagList tags={contentInfo.tags || []} sx={{ alignSelf: "center" }} />
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginY: "16px",
        }}
      >
        {DfContentInfoUtils.getDurationSeconds(contentInfo) > 0 && (
          <Typography variant="caption">
            Duration: {secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(contentInfo))}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          Published on {formatDate(contentInfo.publishedDate)}
        </Typography>{" "}
      </Box>
      {/* Descriptions are prose with real paragraph breaks (YouTube-sourced
          ones especially - blurb, links, then a chapter list). HTML collapses
          those newlines by default, running it all into one block. */}
      <Typography sx={{ whiteSpace: "pre-line" }}>{contentInfo.description}</Typography>
      <Stack spacing={4} sx={{ marginTop: "16px" }}>
        {Boolean(pipelineIds?.length) && (
          <Stack spacing={2}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="h6">Tasks</Typography>
              <Button variant="outlined" onClick={clearCompletedPipelines} disabled={!completedPipelineIds.length}>
                Clear Completed
              </Button>
            </Box>
            {pipelineIds.map((pipelineId) => (
              <PipelineInfoSummaryDetail
                key={`cid-pipeline-info-summary-detail${pipelineId}`}
                pipelineId={pipelineId}
              />
            ))}
          </Stack>
        )}
        {queuedContentAvailability === "PAYWALLED" && <Typography>Content is paywalled</Typography>}
        {dfContentEntry.downloads.length > 0 ? (
          <Box>
            <Typography variant="h6" sx={{ paddingBottom: 2 }}>
              Downloaded Content
            </Typography>
            <DownloadedInfoList contentEntry={dfContentEntry} />
          </Box>
        ) : (
          <Typography color="text.disabled">No downloaded content yet</Typography>
        )}
        <Box>
          <Typography variant="h6" sx={{ paddingBottom: 2 }}>
            Available Downloads
          </Typography>
          <MediaInfoList contentEntry={dfContentEntry} />
        </Box>
      </Stack>
    </ContentItemDetailContainer>
  ) : (
    <Typography>ERROR</Typography>
  );
};

// Make a table with these
