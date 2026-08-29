import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { monoFontFamily } from "../../../themes/build-theme";
import { DownloadDetailsDialog } from "./download-details-dialog.component.tsx";
import { DownloadedItemActions } from "./downloaded-item-actions.component.tsx";

/**
 * What is actually on disk, as rows.
 *
 * Replaces a five-column table whose Location cell held a full absolute path -
 * unbounded content in a fixed column, which forced the whole detail modal to
 * scroll sideways once it became two columns. The path is the least-scanned
 * value here, so it is truncated to the filename and the row opens the file's
 * own dialog where the whole thing is legible.
 */
export type OnDiskRowsProps = {
  contentEntry: DfContentEntry;
};

export const OnDiskRows = ({ contentEntry }: OnDiskRowsProps) => (
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const subtitles = download.subtitles || [];
  const fileName = download.downloadLocation.split(/[\/]/).pop() || download.downloadLocation;
  return (
    <>
      <Tooltip title="File details" enterDelay={700}>
        <Box
          onClick={() => setDetailsOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDetailsOpen(true);
            }
          }}
          sx={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            columnGap: 1,
            paddingY: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
            cursor: "pointer",
            "&:hover": { backgroundColor: "action.hover" },
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
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
            <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }} noWrap>
              {fileName}
            </Typography>
            {/* Subtitles collapse to a count here. Listing each one put three
                more truncated mono lines in the narrowest column on the page,
                to say something the dialog says properly. */}
            {subtitles.length > 0 && (
              <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }} noWrap>
                {`${subtitles.length} subtitle${subtitles.length === 1 ? "" : "s"} · ${
                  subtitles.some((subtitle) => subtitle.path) ? "srt" : "embedded"
                }`}
              </Typography>
            )}
          </Box>
          <DownloadedItemActions contentEntry={contentEntry} download={download} />
        </Box>
      </Tooltip>
      <DownloadDetailsDialog
        contentEntry={contentEntry}
        download={download}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
      />
    </>
  );
};
