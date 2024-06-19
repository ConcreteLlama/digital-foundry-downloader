import Refresh from "@mui/icons-material/Refresh";
import { Box, Button, IconButton, Stack, Typography, useMediaQuery } from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { Image } from "mui-image";
import { useSelector } from "react-redux";
import { useDfContentEntry } from "../../../hooks/use-df-content-entry.ts";
import { refreshDfContentMeta } from "../../../store/df-content/df-content.action.ts";
import { controlTaskPipeline } from "../../../store/df-tasks/tasks.action.ts";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { theme } from "../../../themes/theme.ts";
import { formatDate } from "../../../utils/date.ts";
import { DfTagList } from "../df-tag-list.component.tsx";
import { DownloadedInfoList } from "../downloaded-info/downloaded-info-list.component.tsx";
import { MediaInfoList } from "../media-info/media-info-list.component.tsx";
import { PipelineInfoSummaryDetail } from "../queued-task-info.tsx";
import { ContentItemDetailContainer } from "./df-content-item-detail.styles.tsx";

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
};

export const DfContentInfoItemDetail = ({ dfContentName }: DfContentInfoItemDetailProps) => {
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const dfContentEntry = useDfContentEntry(dfContentName);
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
      store.dispatch(controlTaskPipeline.start({ pipelineExecutionId: pipelineId, action: "clear" }));
    });
  };
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  const { statusInfo } = dfContentEntry;
  const queuedContentStatus = statusInfo.status;
  return dfContentEntry ? (
    <ContentItemDetailContainer>
      <Typography variant="h4" align="center">
        {contentInfo.title}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Image src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)} width={belowMd ? "90%" : "70%"}></Image>
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
        <Typography variant="caption">
          Duration: {secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(contentInfo))}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Published on {formatDate(contentInfo.publishedDate)}
        </Typography>{" "}
      </Box>

      <Typography>{contentInfo.description}</Typography>
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
        {queuedContentStatus === "PAYWALLED" && <Typography>Content is paywalled</Typography>}
        {dfContentEntry.downloads.length > 0 ? (
          <Box>
            <Typography variant="h6" sx={{ paddingBottom: 2 }}>
              Downloaded Content
            </Typography>
            <DownloadedInfoList contentEntry={dfContentEntry} />
          </Box>
        ) : (
          <Typography color="grey">No downloaded content yet</Typography>
        )}
        <Box>
          <Typography variant="h6" sx={{ paddingBottom: 2 }}>
            Available Downloads
          </Typography>
          <MediaInfoList contentEntry={dfContentEntry} />
        </Box>
      </Stack>
      <Box
        sx={{
          display: "flex",
          justifyContent: "right",
          alignItems: "center",
        }}
      >
        <Typography variant="caption">Refresh content metadata</Typography>
        <IconButton
          size="small"
          aria-label="Refresh content metadata"
          onClick={() => {
            store.dispatch(refreshDfContentMeta.start(dfContentName));
          }}
        >
          <Refresh />
        </IconButton>
      </Box>
    </ContentItemDetailContainer>
  ) : (
    <Typography>ERROR</Typography>
  );
};

// Make a table with these
