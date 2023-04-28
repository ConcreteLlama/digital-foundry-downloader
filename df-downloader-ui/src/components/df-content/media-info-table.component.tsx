import DownloadIcon from "@mui/icons-material/Download";
import { IconButton, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { MediaInfo } from "df-downloader-common";
import { store } from "../../store/store";
import { startDownload } from "../../store/download-queue/download-queue.action";

type MediaInfoTableProps = {
  contentName: string;
  currentDownloadingType?: string;
  mediaInfo: MediaInfo[];
};

export const MediaInfoTable = ({ contentName, currentDownloadingType, mediaInfo }: MediaInfoTableProps) => {
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
