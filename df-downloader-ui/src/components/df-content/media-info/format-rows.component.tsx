import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Box, Stack, Typography } from "@mui/material";
import {
  audioPropertiesToString,
  bytesToHumanReadable,
  DfContentEntryUtils,
  videoPropertiesToString,
} from "df-downloader-common";
import { monoFontFamily } from "../../../themes/build-theme";
import { StartDownloadingButton } from "../start-download-dialog.component";
import { MediaInfoListProps } from "./media-info-list.component";

/**
 * Available formats as rows rather than a five-column table.
 *
 * The table needed ~560px to avoid clipping, which was fine when the detail
 * modal was one wide centred column and is not fine now that the actionable
 * half is a side column - it simply scrolled sideways. A row wraps its
 * specifics onto a second line instead, so nothing is ever off to the right.
 */
export const FormatRows = ({ contentEntry }: MediaInfoListProps) => {
  const { contentInfo } = contentEntry;
  return (
    <Stack sx={{ marginTop: 1 }}>
      {contentInfo.mediaInfo.map((mediaInfo) => {
        const held = Boolean(DfContentEntryUtils.getDownloadForFormat(contentEntry, mediaInfo.formatString));
        const specifics = [
          videoPropertiesToString(mediaInfo.videoProperties),
          audioPropertiesToString(mediaInfo.audioProperties),
        ]
          .filter((part) => part && part !== "None")
          .join("  ·  ");
        return (
          <Box
            key={`format-row-${contentInfo.name}-${mediaInfo.formatString}`}
            sx={{
              display: "grid",
              gridTemplateColumns: "auto minmax(0, 1fr) auto",
              alignItems: "center",
              columnGap: 1,
              paddingY: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {/* Held on disk already - a tick, not just a different colour. */}
            {held ? (
              <CheckCircleIcon sx={{ fontSize: 14, color: "success.main" }} />
            ) : (
              <Box sx={{ width: 14 }} />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0 }}>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }} noWrap>
                  {mediaInfo.formatString}
                </Typography>
                <Typography
                  sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.secondary" }}
                  noWrap
                >
                  {bytesToHumanReadable(mediaInfo.size || 0)}
                </Typography>
              </Stack>
              {specifics && (
                <Typography
                  sx={{ fontFamily: monoFontFamily, fontSize: "0.625rem", color: "text.disabled" }}
                  noWrap
                >
                  {specifics}
                </Typography>
              )}
            </Box>
            <StartDownloadingButton contentEntry={contentEntry} mediaFormat={mediaInfo.formatString} />
          </Box>
        );
      })}
    </Stack>
  );
};
