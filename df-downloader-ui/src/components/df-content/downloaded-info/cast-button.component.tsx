import CastIcon from "@mui/icons-material/Cast";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";
import { DfContentEntry, PlaybackVideoCodec } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useEffect, useState } from "react";
import { mintCastUrl } from "../../../api/playback.ts";
import { castMedia, subscribeCastAvailability } from "../../../utils/cast.ts";
import { triggerSnackbar } from "../../../utils/snackbar.tsx";

export type CastButtonProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  /** Casting picks up where in-app playback got to, rather than restarting. */
  currentSeconds?: number;
  /** Only used to explain a failure - see the HEVC note below. */
  videoCodec?: PlaybackVideoCodec;
};

/**
 * Sends a downloaded file to a cast device on the network.
 *
 * Appears only when there is somewhere to send it: the Cast sender API
 * exists in desktop Chrome and Edge and not in Firefox, Safari or Chrome on
 * Android, and even where it exists there may be no receiver switched on. A
 * button that opens an empty device picker is worse than no button.
 *
 * Pressing it is what mints the signed URL the receiver fetches with -
 * nothing is prepared in advance, because that URL is a bearer capability
 * for that file until it expires. See the service's cast-url-signing.ts.
 */
export const CastButton = ({ contentEntry, download, currentSeconds, videoCodec }: CastButtonProps) => {
  const [castable, setCastable] = useState(false);
  const [busy, setBusy] = useState(false);

  // One shared answer for every player on the page - see cast.ts. Subscribing
  // per component let two players disagree about whether Cast was available.
  useEffect(() => subscribeCastAvailability(setCastable), []);

  if (!castable) {
    return null;
  }

  const startCast = async () => {
    setBusy(true);
    try {
      const urls = await mintCastUrl(contentEntry.key, download.downloadLocation);
      if (!urls) {
        // The service refuses rather than guessing when it cannot work out
        // an address a receiver could reach it on - see getLanReachableAddress.
        throw new Error("The server could not produce a cast URL");
      }
      await castMedia(urls, currentSeconds ?? 0);
      triggerSnackbar(`Casting ${contentEntry.contentInfo.title}`, { variant: "success" });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Casting failed";
      /*
        The one failure worth explaining rather than reporting verbatim.

        This library is 4K, and whether a receiver can decode HEVC is a
        property of the device - Chromecast hardware below the Ultra tier
        cannot, and there is nothing this app can do about it short of
        transcoding, which it does not yet do. The receiver's own failure
        message says nothing useful, so an HEVC file that would not load is
        worth naming as the likely cause instead of leaving a black screen
        on the television with no explanation on this end.
      */
      const hevcNote =
        videoCodec === "hevc"
          ? " This is an HEVC file, which cast devices below the Chromecast Ultra tier cannot decode."
          : "";
      triggerSnackbar(`${reason}.${hevcNote}`, { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip title="Cast to a device on your network">
      <IconButton
        size="small"
        onClick={(event) => {
          // The player's stage treats a tap as "show the timeline".
          event.stopPropagation();
          void startCast();
        }}
        disabled={busy}
        aria-label="Cast"
        sx={{
          position: "absolute",
          top: 8,
          right: 52,
          zIndex: 2,
          color: "common.white",
          backgroundColor: "rgba(0, 0, 0, 0.45)",
          "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.7)" },
        }}
      >
        {busy ? <CircularProgress size={18} sx={{ color: "common.white" }} /> : <CastIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
};
