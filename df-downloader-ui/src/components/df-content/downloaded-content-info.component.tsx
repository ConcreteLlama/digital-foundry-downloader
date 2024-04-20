import { Tooltip, Typography } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { formatDate } from "../../utils/date";

export type DownloadedContentDetailProps = {
  content: DfContentEntry;
};

export const DownloadedContentSummary = ({ content }: DownloadedContentDetailProps) => {
  const tooltip = content.downloads
    .map((download) => `${download.format} - ${formatDate(download.downloadDate)} - ${download.downloadLocation}`)
    .join("\n");
  const formats = content.downloads.map((download) => download.format).join(", ");
  return (
    <Tooltip title={tooltip}>
      <Typography>{`Downloaded ${formats}`}</Typography>
    </Tooltip>
  );
};
