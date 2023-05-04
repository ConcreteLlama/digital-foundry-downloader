import { Box, Paper, Typography } from "@mui/material";
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

export type DfContentInfoItemDetailProps = {
  dfContentName: string;
};

export const DfContentInfoItemDetail = ({ dfContentName }: DfContentInfoItemDetailProps) => {
  const dfContentEntry = useSelector(selectDfContentInfoItem(dfContentName));
  const downloadStatus = useSelector(selectDownloadItem(dfContentName));
  if (!dfContentEntry) {
    //TODO: Make this more sensible
    return <Typography>ERROR</Typography>;
  }
  const { contentInfo } = dfContentEntry;
  const { statusInfo } = dfContentEntry;
  const contentStatus = statusInfo.status;
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
        <Image src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)} width="50%"></Image>
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
        contentStatus === "CONTENT_PAYWALLED" && <Typography>Content is paywalled</Typography>
      )}
      <Box>
        <Typography variant="h6" sx={{ paddingBottom: 2 }}>
          Available Downloads
        </Typography>
        <MediaInfoList
          currentDownloadingType={downloadStatus?.selectedMediaInfo?.mediaType}
          contentName={contentInfo.name}
          mediaInfo={contentInfo.mediaInfo}
        />
      </Box>
    </Paper>
  ) : (
    <Typography>ERROR</Typography>
  );
};

// Make a table with these
