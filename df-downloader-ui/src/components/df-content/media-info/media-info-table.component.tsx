import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { StartDownloadingButton } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";

export const MediaInfoTable = ({ contentInfo, currentDownloadingType, mediaInfo }: MediaInfoListProps) => {
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
        {mediaInfo.map((mediaInfo) => (
          <TableRow>
            <TableCell>{mediaInfo.mediaType}</TableCell>
            <TableCell>{mediaInfo.size}</TableCell>
            <TableCell>{mediaInfo.videoEncoding}</TableCell>
            <TableCell>{mediaInfo.audioEncoding}</TableCell>
            <TableCell>
              <StartDownloadingButton contentInfo={contentInfo} mediaType={mediaInfo.mediaType} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
