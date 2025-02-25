import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { StartDownloadingButton } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";

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
            <TableRow key={`media-info-table-${contentInfo.name}-${mediaInfo.format}`}>
              <TableCell>{mediaInfo.format}</TableCell>
              <TableCell>{mediaInfo.size}</TableCell>
              <TableCell>{mediaInfo.videoEncoding}</TableCell>
              <TableCell>{mediaInfo.audioEncoding}</TableCell>
              <TableCell>
                <StartDownloadingButton contentEntry={contentEntry} mediaFormat={mediaInfo.format} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
