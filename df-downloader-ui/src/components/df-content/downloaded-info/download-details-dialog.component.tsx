import { useState } from "react";
import { Box, Dialog, DialogContent, DialogTitle, Divider, Stack, Typography } from "@mui/material";
import { DfContentEntry, audioPropertiesToString, videoPropertiesToString } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { monoFontFamily } from "../../../themes/build-theme";
import { formatDate } from "../../../utils/date";
import { DownloadedItemActions } from "./downloaded-item-actions.component.tsx";

export type DownloadDetailsDialogProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  open: boolean;
  onClose: () => void;
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box>
    <Typography variant="overline" sx={{ color: "text.disabled" }}>
      {label}
    </Typography>
    {children}
  </Box>
);

/**
 * Everything about one file on disk, in full.
 *
 * The on-disk row is deliberately one line per file, so the path - the longest
 * and least scannable value it holds - was reduced to an ellipsis with the
 * whole thing in a tooltip. Tooltips do not exist on a touch device, which is
 * where this app is often used, so on a phone the path was simply unreadable.
 * Here it wraps, in full, and can be selected and copied.
 */
export const DownloadDetailsDialog = ({
  contentEntry,
  download,
  open,
  onClose,
}: DownloadDetailsDialogProps) => {
  // Whether the player this dialog opened is currently up - see the Dialog's
  // sx below.
  const [playingHere, setPlayingHere] = useState(false);

  const subtitles = download.subtitles || [];
  // Same formatters the format rows use, so a held format and the file it
  // produced describe themselves identically. Both return "None" rather than
  // null when absent.
  const mediaSpecifics = (
    [
      { kind: "video", text: videoPropertiesToString(download.mediaInfo.videoProperties) },
      { kind: "audio", text: audioPropertiesToString(download.mediaInfo.audioProperties) },
    ] as const
  ).filter(({ text }) => text && text !== "None");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      /*
        Hidden rather than closed while the player is up.

        The player is opened from this dialog's own buttons and is rendered
        by them, so closing this would unmount the player along with it.
        Staying mounted but out of sight also means closing the player puts
        you back on the file you opened it from.
      */
      sx={playingHere ? { visibility: "hidden" } : undefined}
    >
      <DialogTitle sx={{ paddingBottom: 1 }}>
        <Typography variant="h6" sx={{ wordBreak: "break-word" }}>
          {download.mediaInfo.formatString}
        </Typography>
        <Typography
          sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.disabled" }}
        >
          {[download.size, download.downloadDate ? formatDate(download.downloadDate) : undefined]
            .filter(Boolean)
            .join("  ·  ")}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Field label="Location">
            {/* wordBreak, not noWrap: this is the one place the whole path is
                meant to be legible. */}
            <Typography
              sx={{
                fontFamily: monoFontFamily,
                fontSize: "0.75rem",
                wordBreak: "break-all",
                userSelect: "text",
              }}
            >
              {download.downloadLocation}
            </Typography>
          </Field>

          {mediaSpecifics.length > 0 && (
            <Field label="Media">
              <Stack spacing={0.25}>
                {mediaSpecifics.map(({ kind, text }) => (
                  <Typography key={kind} sx={{ fontFamily: monoFontFamily, fontSize: "0.75rem" }}>
                    {`${kind}  ·  ${text}`}
                  </Typography>
                ))}
              </Stack>
            </Field>
          )}

          <Field label={`Subtitles${subtitles.length ? ` · ${subtitles.length}` : ""}`}>
            {subtitles.length ? (
              <Stack spacing={1}>
                {subtitles.map((subtitle, index) => (
                  <Box key={`${subtitle.language}-${index}`}>
                    <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.75rem" }}>
                      {`${subtitle.path ? "srt" : "embedded"}  ·  ${subtitle.service}  ·  ${subtitle.language}`}
                    </Typography>
                    <Typography
                      sx={{
                        fontFamily: monoFontFamily,
                        fontSize: "0.6875rem",
                        color: "text.disabled",
                        wordBreak: "break-all",
                      }}
                    >
                      {subtitle.path ??
                        'Inside the video file - no separate transcript. Turn on "keep transcript" in Subtitles settings to get one.'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.disabled">
                None
              </Typography>
            )}
          </Field>

          <Divider />
          <DownloadedItemActions
            contentEntry={contentEntry}
            download={download}
            variant="buttons"
            onPlayerOpenChange={setPlayingHere}
          />
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
