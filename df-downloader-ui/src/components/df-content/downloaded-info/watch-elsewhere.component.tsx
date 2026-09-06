import { Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { DfContentEntry } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useEffect, useState } from "react";
import { getPlaybackOpenInLinks } from "../../../api/playback.ts";

export type WatchElsewhereDialogProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  open: boolean;
  onClose: () => void;
};

/**
 * Where else this file can be watched.
 *
 * Its own component because it is offered from two places that have nothing
 * else in common - beside the source picker on the content panel, and in a
 * download's own actions - and the interesting part is the lookup rather than
 * the markup. Two copies of that would drift.
 *
 * The lookup happens when this opens, never before. Neither Plex nor Jellyfin
 * can find an item by path, so answering means the server reading back its
 * library, which is far too much to spend on rendering a list of files on the
 * chance somebody asks.
 */
export const WatchElsewhereDialog = ({ contentEntry, download, open, onClose }: WatchElsewhereDialogProps) => {
  const [links, setLinks] = useState<{ server: string; url: string }[] | undefined>();

  /*
   * In an effect, not during render. Fetching where this used to sit fired on
   * every render until the answer arrived, which for a lookup that reads back
   * a whole library is a queue of them.
   */
  useEffect(() => {
    if (!open || links !== undefined) {
      return;
    }
    let cancelled = false;
    void getPlaybackOpenInLinks(contentEntry.key, download.downloadLocation)
      .then((found) => !cancelled && setLinks(found))
      // An empty list either way: a server that cannot answer and one with
      // nothing to offer look the same from here, and neither is worth an
      // error over a convenience.
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [open, links, contentEntry.key, download.downloadLocation]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Watch elsewhere</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ paddingTop: 1 }}>
          {links === undefined && <Typography variant="body2">Looking for it on your media servers...</Typography>}
          {links?.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              None of your media servers has this file indexed yet. A recent download may not have been scanned, and a
              server needs to be signed in rather than only holding an API key.
            </Typography>
          )}
          {links?.map((link) => (
            <Button
              key={link.server}
              variant="outlined"
              component="a"
              href={link.url}
              target="_blank"
              rel="noreferrer"
              startIcon={<OpenInNewIcon />}
              onClick={onClose}
              sx={{ textTransform: "capitalize" }}
            >
              Open in {link.server}
            </Button>
          ))}
          {links && links.length > 0 && (
            <Typography variant="caption" color="text.disabled">
              Opens the server's web player rather than the phone app. Plex needs you signed in to plex.tv in that
              browser; Jellyfin goes straight to your server.
            </Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
