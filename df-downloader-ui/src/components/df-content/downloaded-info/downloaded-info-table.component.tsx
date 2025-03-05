import { Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { DownloadedInfoListProps } from "./downloaded-info-list.component.tsx";
import { DownloadedItemActions } from "./downloaded-item-actions.component.tsx";
import { SubtitlesInfo } from "./subtitles-info.component.tsx";

export const DownloadedInfoTable = ({ contentEntry }: DownloadedInfoListProps) => {
  const { downloads } = contentEntry;
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Format</TableCell>
          <TableCell>Size</TableCell>
          <TableCell>Subtitles</TableCell>
          <TableCell>Location</TableCell>
          <TableCell>Actions</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {downloads.map((download) => (
          <DownloadedInfoTableRow
            download={download}
            contentEntry={contentEntry}
            key={`dl-info-table-row-${contentEntry.name}-download-${download.downloadDate.toString()}`}
          />
        ))}
      </TableBody>
    </Table>
  );
};

type DownloadedInfoTableRowProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};
const DownloadedInfoTableRow = ({ download, contentEntry }: DownloadedInfoTableRowProps) => {
  return (
    <TableRow>
      <TableCell>{download.mediaInfo.formatString}</TableCell>
      <TableCell>{download.size}</TableCell>
      <TableCell>
        <SubtitlesInfo subtitles={download.subtitles || []} />
      </TableCell>
      <TableCell>{download.downloadLocation}</TableCell>
      <TableCell>
        <DownloadedItemActions contentEntry={contentEntry} download={download} />
      </TableCell>
    </TableRow>
  );
};
