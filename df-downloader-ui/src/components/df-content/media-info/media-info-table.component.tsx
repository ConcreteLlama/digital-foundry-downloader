import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { StartDownloadingButton, getDownloadVariant } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";
import { get } from "lodash";

export const MediaInfoTable = ({
  contentInfo,
  currentDownloadingType,
  downloadedContentType,
  mediaInfo,
}: MediaInfoListProps) => {
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
          const downloadVariant = getDownloadVariant(
            mediaInfo.mediaType,
            currentDownloadingType,
            downloadedContentType
          );
          return (
            <TableRow>
              <TableCell>{mediaInfo.mediaType}</TableCell>
              <TableCell>{mediaInfo.size}</TableCell>
              <TableCell>{mediaInfo.videoEncoding}</TableCell>
              <TableCell>{mediaInfo.audioEncoding}</TableCell>
              <TableCell>
                <StartDownloadingButton
                  contentInfo={contentInfo}
                  mediaType={mediaInfo.mediaType}
                  disabled={!Boolean(mediaInfo.url) || downloadVariant === "downloading"}
                  variant={downloadVariant}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
