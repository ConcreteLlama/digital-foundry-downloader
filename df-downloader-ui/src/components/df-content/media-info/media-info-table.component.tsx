import DownloadIcon from "@mui/icons-material/Download";
import { IconButton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { store } from "../../../store/store";
import { startDownload } from "../../../store/download-queue/download-queue.action";
import { MediaInfoListProps } from "./media-info-list.component";

export const MediaInfoTable = ({ contentName, currentDownloadingType, mediaInfo }: MediaInfoListProps) => {
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
              <IconButton
                disabled={Boolean(currentDownloadingType)}
                onClick={() => {
                  store.dispatch(
                    startDownload.start({
                      name: contentName,
                      mediaType: mediaInfo.mediaType,
                    })
                  );
                }}
              >
                <DownloadIcon />
              </IconButton>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
