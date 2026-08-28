import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { monoFontFamily } from "../../../themes/build-theme";
import { DownloadedInfoListProps } from "./downloaded-info-list.component.tsx";
import { DownloadedItemActions } from "./downloaded-item-actions.component.tsx";

/**
 * What is actually on disk, as rows.
 *
 * Replaces a five-column table whose Location cell held a full absolute path -
 * unbounded content in a fixed column, which forced the whole detail modal to
 * scroll sideways once it became two columns. The path is the least-scanned
 * value here, so it wraps under the filename and lives in a tooltip.
 */
export const OnDiskRows = ({ contentEntry }: DownloadedInfoListProps) => (
  <Stack sx={{ marginTop: 1 }}>
    {contentEntry.downloads.map((download) => (
      <OnDiskRow
        key={`on-disk-${contentEntry.key}-${download.downloadDate.toString()}`}
        contentEntry={contentEntry}
        download={download}
      />
    ))}
  </Stack>
);

type OnDiskRowProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
};

const OnDiskRow = ({ contentEntry, download }: OnDiskRowProps) => {
  // The transcript itself is not persisted anywhere on the model - only the
  // fact that a subtitle track exists, and which service produced it. Showing
  // that honestly rather than implying a file that may not be there.
  const subtitles = download.subtitles || [];
  const fileName = download.downloadLocation.split(/[\\/]/).pop() || download.downloadLocation;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "start",
        columnGap: 1,
        paddingY: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }} noWrap>
            {download.mediaInfo.formatString}
          </Typography>
          <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.secondary" }} noWrap>
            {download.size}
          </Typography>
        </Stack>
        <Tooltip title={download.downloadLocation}>
          <Typography
            sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }}
            noWrap
          >
            {fileName}
          </Typography>
        </Tooltip>
        {subtitles.length > 0 && (
          <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }} noWrap>
            {subtitles.map((s) => `srt · ${s.service} · ${s.language}`).join("  ·  ")}
          </Typography>
        )}
      </Box>
      <DownloadedItemActions contentEntry={contentEntry} download={download} />
    </Box>
  );
};
