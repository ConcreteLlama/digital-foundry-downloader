import CloseIcon from "@mui/icons-material/Close";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useState } from "react";
import { monoFontFamily } from "../../../themes/build-theme";
import { DownloadPlayer } from "./download-player.component.tsx";

export type VideoPlayerDialogProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  open: boolean;
  onClose: () => void;
};

/**
 * One downloaded file, played on its own.
 *
 * The content panel already plays a download inline (see
 * content-media.component.tsx), so this exists for what that cannot do:
 * playing a *specific* file from the Files tab when an item has several, and
 * giving the video the window rather than half of a two-column panel.
 *
 * Theater mode is the default on a wide screen - video as large as the
 * window allows with the chapters in a rail beside it, rather than pushed
 * below where a long chapter list scrolls out of sight. That rail is also
 * the intended home for the AI-analysis timestamp linkage (roadmap item 10's
 * follow-up): it takes a `sidePanel` slot for exactly that, and anything in
 * it can seek the video the same way the chapter list already does.
 */
export const VideoPlayerDialog = ({ contentEntry, download, open, onClose }: VideoPlayerDialogProps) => {
  const theme = useTheme();
  // Theater needs the width to be worth it; below md the rail stacks anyway,
  // at which point it is just the ordinary layout with extra chrome.
  const wideEnough = useMediaQuery(theme.breakpoints.up("md"));
  const [theater, setTheater] = useState(true);
  const inTheater = theater && wideEnough;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={inTheater ? false : "lg"}
      fullWidth
      PaperProps={{
        sx: inTheater
          ? {
              // Nearly the whole viewport, but not fullscreen - it is still a
              // dialog over the content panel, and should read as one.
              width: "96vw",
              maxWidth: "96vw",
              height: "92vh",
              maxHeight: "92vh",
            }
          : undefined,
      }}
    >
      <DialogTitle sx={{ paddingBottom: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <Typography variant="h6" sx={{ wordBreak: "break-word" }}>
              {contentEntry.contentInfo.title}
            </Typography>
            <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled" }}>
              {[download.mediaInfo.formatString, download.size].filter(Boolean).join("  ·  ")}
            </Typography>
          </Box>
          {wideEnough && (
            <Tooltip title={theater ? "Chapters below the video" : "Theater mode - chapters beside the video"}>
              <IconButton onClick={() => setTheater((current) => !current)} aria-label="Toggle theater mode">
                {theater ? <ViewStreamIcon /> : <ViewSidebarIcon />}
              </IconButton>
            </Tooltip>
          )}
          <IconButton onClick={onClose} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={inTheater ? { display: "flex", minHeight: 0 } : undefined}>
        {/* Mounted only while open, so closing the dialog stops the download
            being streamed rather than leaving it buffering out of sight. */}
        {open && (
          <DownloadPlayer
            contentEntry={contentEntry}
            download={download}
            autoPlay
            layout={inTheater ? "theater" : "stacked"}
            // In theater the video fills the column it is given; stacked keeps
            // a ceiling so the chapters below it stay on screen.
            maxHeight={inTheater ? "100%" : "60vh"}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
