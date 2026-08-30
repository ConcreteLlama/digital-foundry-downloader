import CloseIcon from "@mui/icons-material/Close";
import ViewSidebarIcon from "@mui/icons-material/ViewSidebar";
import ViewStreamIcon from "@mui/icons-material/ViewStream";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useEffect, useState } from "react";
import { monoFontFamily } from "../../../themes/build-theme";
import { useAnalysisJumps } from "../ai-analysis/analysis-jumps.ts";
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
 * window allows with the timeline in a rail beside it, rather than pushed
 * below where a long list scrolls out of sight. Stacked, the video sticks to
 * the top of the dialog and the timeline scrolls under it, which is the same
 * arrangement turned ninety degrees.
 *
 * That timeline is chapters and AI-analysis findings interleaved in time
 * order - see DownloadPlayer's analysisJumps. This component's only job in
 * that is fetching them, since it is the part that knows which piece of
 * content is being played.
 */
export const VideoPlayerDialog = ({ contentEntry, download, open, onClose }: VideoPlayerDialogProps) => {
  /*
    Theater needs room in both directions, which is why this is a raw query
    rather than a breakpoint.

    `up("md")` was measured wrong on a real phone: 900 CSS px of width is
    reachable on a handset, so theater engaged and produced a postage-stamp
    video beside a full-height rail. Width alone cannot tell those apart -
    what makes theater worth it is having enough height for a large video
    *and* enough width for a rail beside it, so both are asked for.
  */
  const roomForTheater = useMediaQuery("(min-width:1200px) and (min-height:640px)");
  const [theater, setTheater] = useState(true);

  /*
    Back to theater every time it is opened.

    This dialog stays mounted and only gates its contents on `open`, so the
    toggle used to outlive the thing it applied to - turning it off stuck for
    every later open, including for a different file entirely, and then reset
    when the panel closed. Half-remembered was the worst of both; theater is
    documented as the default, so opening honours that.
  */
  useEffect(() => {
    if (open) {
      setTheater(true);
    }
  }, [open]);
  const inTheater = theater && roomForTheater;

  // Only while open: a closed dialog is not worth a request, and the one
  // that matters is made the moment it opens.
  const { jumps } = useAnalysisJumps(contentEntry.key, open);

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
          {roomForTheater && (
            <Tooltip title={theater ? "Timeline below the video" : "Theater mode - timeline beside the video"}>
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
      <DialogContent
        sx={
          inTheater
            ? { display: "flex", minHeight: 0 }
            : // No top padding, so the video can sit flush against the top of
              // the scroller. `position: sticky` pins to the padding box, so
              // any padding here becomes a strip above the pinned video that
              // the timeline visibly scrolls through.
              { paddingTop: 0 }
        }
      >
        {/* Mounted only while open, so closing the dialog stops the download
            being streamed rather than leaving it buffering out of sight. */}
        {open && (
          <DownloadPlayer
            contentEntry={contentEntry}
            download={download}
            autoPlay
            layout={inTheater ? "theater" : "stacked"}
            // In theater the video fills the column it is given; stacked keeps
            // a ceiling so the timeline below it stays on screen.
            maxHeight={inTheater ? "100%" : "55vh"}
            // Beside the video in theater, under it when stacked - the
            // player renders the timeline in both layouts, so "alongside or
            // below" falls out of the layout choice already being made.
            analysisJumps={jumps}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
