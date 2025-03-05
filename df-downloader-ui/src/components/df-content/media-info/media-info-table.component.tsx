import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { StartDownloadingButton } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";
import { audioPropertiesToString, bytesToHumanReadable, videoPropertiesToString } from "df-downloader-common";

export const MediaInfoTable = ({ contentEntry }: MediaInfoListProps) => {
  const { contentInfo } = contentEntry;
  const { mediaInfo } = contentInfo;
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Format</TableCell>
          <TableCell>Size</TableCell>
          <TableCell>Video Encoding</TableCell>
          <TableCell>Audio Encoding</TableCell>
          <TableCell>Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {mediaInfo.map((mediaInfo) => {
          return (
            <TableRow key={`media-info-table-${contentInfo.name}-${mediaInfo.formatString}`}>
              <TableCell>{mediaInfo.formatString}</TableCell>
              <TableCell>{bytesToHumanReadable(mediaInfo.size || 0)}</TableCell>
              <TableCell>{videoPropertiesToString(mediaInfo.videoProperties)}</TableCell>
              <TableCell>{audioPropertiesToString(mediaInfo.audioProperties)}</TableCell>
              <TableCell>
                <StartDownloadingButton contentEntry={contentEntry} mediaFormat={mediaInfo.formatString} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
