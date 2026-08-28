import { Box, Button, Stack, Typography } from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { clearPipeline } from "../../../api/tasks.ts";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { fetchYtVideoMeta, refreshDfContentMeta } from "../../../store/df-content/df-content.action.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { formatDate } from "../../../utils/date.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import { Thumb } from "../../general/thumb.component.tsx";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";
import { DfTagList } from "../df-tag-list.component.tsx";
import { OnDiskRows } from "../downloaded-info/on-disk-rows.component.tsx";
import { FormatRows } from "../media-info/format-rows.component.tsx";
import { PipelineInfoSummaryDetail } from "../queued-task-info.tsx";
import { ContentItemDetailContainer } from "./df-content-item-detail.styles.tsx";

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
};

export const DfContentInfoItemDetail = ({ dfContentName }: DfContentInfoItemDetailProps) => {
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
      <Typography variant="h5" sx={{ marginBottom: 0.5 }}>
        {contentInfo.title}
      </Typography>
      {/* One tabular identity line rather than three scattered captions. */}
      <Typography
        sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled", marginBottom: 2 }}
      >
        {[
          formatDate(contentInfo.publishedDate),
          DfContentInfoUtils.getDurationSeconds(contentInfo) > 0
            ? secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(contentInfo))
            : undefined,
          contentInfo.youtubeVideoId ? `youtube: ${contentInfo.youtubeVideoId}` : undefined,
          `key: ${dfContentEntry.key}`,
        ]
          .filter(Boolean)
          .join("  ·  ")}
      </Typography>

      {/*
        Two columns: the media and its prose on the left, everything you can
        act on - what exists on disk, what can still be fetched - on the right
        and permanently in view. It used to be one centred column that put the
        formats below the description, so on a long YouTube description the
        actionable half was off-screen.
      */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.15fr) minmax(0, 1fr)" },
          gap: 4,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {contentInfo.youtubeVideoId ? (
            <YouTubeEmbed videoId={contentInfo.youtubeVideoId} width="100%" />
          ) : (
            <Thumb
              src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)}
              alt={contentInfo.title}
              width="100%"
            />
          )}
          <DfTagList tags={contentInfo.tags || []} sx={{ justifyContent: "flex-start", marginTop: 2 }} />
          {/* Descriptions are prose with real paragraph breaks (YouTube-sourced
              ones especially - blurb, links, then a chapter list). HTML collapses
              those newlines by default, running it all into one block. */}
          <Typography variant="body2" sx={{ whiteSpace: "pre-line", marginTop: 2, color: "text.secondary" }}>
            {contentInfo.description}
          </Typography>
        </Box>

        <Stack spacing={3} sx={{ minWidth: 0 }}>
          {Boolean(pipelineIds?.length) && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 1 }}>
                <Typography variant="overline">Tasks</Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={clearCompletedPipelines}
                  disabled={!completedPipelineIds.length}
                >
                  Clear completed
                </Button>
              </Box>
              <Stack spacing={1}>
                {pipelineIds.map((pipelineId) => (
                  <PipelineInfoSummaryDetail
                    key={`cid-pipeline-info-summary-detail${pipelineId}`}
                    pipelineId={pipelineId}
                  />
                ))}
              </Stack>
            </Box>
          )}

          <Box>
            <Typography variant="overline">
              On disk
              {dfContentEntry.downloads.length > 0 ? ` · ${dfContentEntry.downloads.length} file${dfContentEntry.downloads.length === 1 ? "" : "s"}` : ""}
            </Typography>
            {dfContentEntry.downloads.length > 0 ? (
              <OnDiskRows contentEntry={dfContentEntry} />
            ) : (
              <Typography variant="body2" color="text.disabled" sx={{ marginTop: 1 }}>
                Nothing downloaded yet
              </Typography>
            )}
          </Box>

          <Box>
            <Typography variant="overline">Available formats</Typography>
            {queuedContentAvailability === "PAYWALLED" && (
              <Typography variant="body2" color="text.disabled" sx={{ marginTop: 1 }}>
                Paywalled - not in your tier
              </Typography>
            )}
            <FormatRows contentEntry={dfContentEntry} />
          </Box>
        </Stack>
      </Box>
    </ContentItemDetailContainer>
  ) : (
    <Typography>ERROR</Typography>
  );
};

// Make a table with these
