import { Grid, SxProps } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";

type DownloadSummaryGridProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  sx?: SxProps;
};

export const DownloadSummaryGrid = ({ contentEntry, download, sx }: DownloadSummaryGridProps) => {
  return (
    <Grid container sx={sx}>
      <Grid item xs={3}>
        Content:
      </Grid>
      <Grid item xs={9}>
        {contentEntry.contentInfo.title}
      </Grid>

      <Grid item xs={3}>
        Format:
      </Grid>
      <Grid item xs={9}>
        {download.format}
      </Grid>

      <Grid item xs={3}>
        Size:
      </Grid>
      <Grid item xs={9}>
        {download.size}
      </Grid>

      <Grid item xs={3}>
        Location:
      </Grid>
      <Grid item xs={9}>
        {download.downloadLocation}
      </Grid>
    </Grid>
  );
};
