import { Table, TableBody, TableCell, TableRow, Tooltip, Typography } from "@mui/material";
import { DfContentEntry, DfContentStatusInfoDownloaded } from "df-downloader-common";
import { formatDate } from "../../utils/date";

export type DownloadedContentDetailProps = {
  content: DfContentEntry;
  statusInfo: DfContentStatusInfoDownloaded;

  /**
   *     <Typography>{`Content downloaded ${statusInfo.format} on ${formatDate(statusInfo.downloadDate)} downloaded to: ${
      statusInfo.downloadLocation
    }`}</Typography>
   */
};
export const DownloadedContentDetail = ({ content, statusInfo }: DownloadedContentDetailProps) => {
  //TODO: Make this a table with actions
  return (
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>Download Date</TableCell>
          <TableCell>{formatDate(statusInfo.downloadDate)}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Format</TableCell>
          <TableCell>{statusInfo.format}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Size</TableCell>
          <TableCell>{statusInfo.size}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Location</TableCell>
          <TableCell>{statusInfo.downloadLocation}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
};

export const DownloadedContentSummary = ({ content, statusInfo }: DownloadedContentDetailProps) => {
  return (
    <Tooltip title={`Date: ${statusInfo.downloadDate}\nLocation: ${statusInfo.downloadLocation}`}>
      <Typography>{`Downloaded ${statusInfo.format}`}</Typography>
    </Tooltip>
  );
};
