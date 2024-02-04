import { Box, IconButton, Paper, Typography, useMediaQuery } from "@mui/material";
import { DfContentInfoUtils, secondsToHHMMSS } from "df-downloader-common";
import { Image } from "mui-image";
import { useSelector } from "react-redux";
import { selectDfContentInfoItem } from "../../store/df-content/df-content.selector";
import { selectDownloadItem } from "../../store/download-queue/download-queue.selector";
import { formatDate } from "../../utils/date";
import { isDownloadedContentStatus } from "../../utils/types";
import { DfTagList } from "./df-tag-list.component";
import { DownloadedContentDetail } from "./downloaded-content-info.component";
import { MediaInfoList } from "./media-info/media-info-list.component";
import { QueuedContentDetail } from "./queued-content-info.component";
import { theme } from "../../themes/theme";
import { refreshDfContentMeta } from "../../store/df-content/df-content.action";
import { store } from "../../store/store";
import Refresh from "@mui/icons-material/Refresh";

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
};

export const DfContentInfoItemDetail = ({ dfContentName }: DfContentInfoItemDetailProps) => {
  const belowMd = useMediaQuery(theme.breakpoints.down("md"));
  const dfContentEntry = useSelector(selectDfContentInfoItem(dfContentName));
  const downloadStatus = useSelector(selectDownloadItem(dfContentName));
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  const { statusInfo } = dfContentEntry;
  const queuedContentStatus = statusInfo.status;
  return dfContentEntry ? (
    <Paper
      sx={{
        padding: "5vh",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Typography variant="h4" align="center">
        {contentInfo.title}
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Image src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)} width={belowMd ? "90%" : "70%"}></Image>
      </Box>
      <DfTagList tags={contentInfo.tags || []} sx={{ alignSelf: "center" }} />
      <Typography variant="caption">Published on {formatDate(contentInfo.publishedDate)}</Typography>
      <Typography variant="caption">
        Duration: {secondsToHHMMSS(DfContentInfoUtils.getDurationSeconds(contentInfo))}
      </Typography>
      <Typography>{contentInfo.description}</Typography>
      {downloadStatus ? (
        <QueuedContentDetail queuedContent={downloadStatus} />
      ) : isDownloadedContentStatus(statusInfo) ? (
        <DownloadedContentDetail content={dfContentEntry} statusInfo={statusInfo} />
      ) : (
        queuedContentStatus === "CONTENT_PAYWALLED" && <Typography>Content is paywalled</Typography>
      )}
      <Box>
        <Typography variant="h6" sx={{ paddingBottom: 2 }}>
          Available Downloads
        </Typography>
        <MediaInfoList
          currentDownloadingType={downloadStatus?.selectedMediaInfo?.mediaType}
          downloadedContentType={isDownloadedContentStatus(statusInfo) ? statusInfo.format : undefined}
          contentInfo={contentInfo}
          mediaInfo={contentInfo.mediaInfo}
        />
      </Box>
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
    </Paper>
  ) : (
    <Typography>ERROR</Typography>
  );
};

// Make a table with these
