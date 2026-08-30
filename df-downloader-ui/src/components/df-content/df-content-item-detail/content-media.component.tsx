import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { DfContentEntry, DfContentInfoUtils } from "df-downloader-common";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VideoPlayerDialog } from "../downloaded-info/video-player-dialog.component.tsx";
import { Thumb } from "../../general/thumb.component.tsx";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";

export type ContentMediaProps = {
  contentEntry: DfContentEntry;
  /**
   * Hands the panel above a way to start playback at a given moment, so a
   * timestamp in the analysis can open the video where it is discussed.
   *
   * Only ever handed over for a downloaded file - a YouTube embed is
   * somebody else's iframe and cannot be driven from here.
   */
  onPlayFromReady?: (playFrom: (seconds: number) => void) => void;
};

type MediaSource = { kind: "download"; index: number } | { kind: "youtube" };

const sourceKey = (source: MediaSource) => (source.kind === "youtube" ? "youtube" : `download-${source.index}`);

/**
 * The media at the top of the content panel.
 *
 * Once a file has been downloaded, that file is what you came to watch - so
 * it leads, rather than the YouTube embed of the same video. The embed
 * remains one click away beneath it: it is still the better choice
 * sometimes (a download that this machine has no decoder for, or simply
 * wanting YouTube's own chapters and comments), and it is the only option
 * for anything not downloaded yet.
 *
 * The switcher only appears when there is genuinely something to switch
 * between. With one download and no YouTube id there is nothing to choose,
 * and a control offering a single option is just noise.
 */
export const ContentMedia = ({ contentEntry, onPlayFromReady }: ContentMediaProps) => {
  const { contentInfo, downloads } = contentEntry;
  // Only media worth playing. An archive has nothing to show in a player, and
  // offering it as a source would be a dead end.
  const playable = useMemo(
    () => downloads.filter((download) => ["VIDEO", "AUDIO"].includes(download.mediaInfo.type)),
    [downloads]
  );
  const hasYoutube = Boolean(contentInfo.youtubeVideoId);

  const sources = useMemo<MediaSource[]>(() => {
    const list: MediaSource[] = playable.map((_download, index) => ({ kind: "download", index }));
    if (hasYoutube) {
      list.push({ kind: "youtube" });
    }
    return list;
  }, [playable, hasYoutube]);

  /*
    What you have on disk wins the default; YouTube only when there is
    nothing downloaded.

    Held as "what the user picked" rather than "what is selected", so the
    default can keep following the data. A useState initialiser runs once and
    never reconsiders, so an entry whose downloads had not arrived by the
    first render locked this to YouTube permanently - the panel then offered
    the embed for a video sitting on disk, which is the opposite of what it
    is meant to do.
  */
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? sourceKey(playable.length ? { kind: "download", index: 0 } : { kind: "youtube" });
  const active = sources.find((source) => sourceKey(source) === selected) ?? sources[0];

  const [playerOpen, setPlayerOpen] = useState(false);
  const [startSeconds, setStartSeconds] = useState<number | undefined>(undefined);

  const playFrom = useCallback((seconds?: number) => {
    setStartSeconds(seconds);
    setPlayerOpen(true);
  }, []);
  // Effect rather than during render: handing a function upward is a side
  // effect, and doing it inline would fire on every render.
  useEffect(() => {
    onPlayFromReady?.((seconds: number) => playFrom(seconds));
  }, [onPlayFromReady, playFrom]);

  const label = (source: MediaSource) => {
    if (source.kind === "youtube") {
      return "YouTube";
    }
    const { formatString } = playable[source.index].mediaInfo;
    // "Download" says what the source is; the format says which file, which
    // matters as soon as there are two of them and is worth knowing even when
    // there is only one (an HEVC file behaves differently to an h.264 one).
    const sameFormat = playable.filter((other) => other.mediaInfo.formatString === formatString);
    if (sameFormat.length > 1) {
      // Two files of the same format would otherwise be two identical buttons.
      const position = sameFormat.indexOf(playable[source.index]) + 1;
      return `Download ${position} (${formatString})`;
    }
    return `Download (${formatString})`;
  };

  const switcher = sources.length > 1 && (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, marginTop: 1, flexWrap: "wrap" }}>
      <Typography variant="overline" sx={{ color: "text.disabled" }}>
        Watching
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={selected}
        onChange={(_event, next: string | null) => {
          // Null arrives when the active button is pressed again. There is
          // always a source playing, so that is a no-op rather than a deselect.
          if (next) {
            setChosen(next);
          }
        }}
      >
        {sources.map((source) => (
          <ToggleButton
            key={sourceKey(source)}
            value={sourceKey(source)}
            sx={{ textTransform: "none", paddingY: 0.25, fontSize: "0.75rem" }}
          >
            {label(source)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  );

  /*
    The player, available whichever source the panel is showing.

    It used to be rendered inside the download branch, so switching the panel
    to YouTube took it out of the tree - and clicking an analysis timestamp
    then set state that nothing rendered, doing visibly nothing at all.

    A timestamp is an offset into the file that was transcribed and analysed,
    not into YouTube's copy of the video: the same edit usually, but not
    dependably, and a sponsor read of a different length would land the
    viewer somewhere else entirely while looking like it worked. So the
    toggle decides what the panel shows, and a timestamp always opens the
    file the timestamp came from.
  */
  const playbackDownload = playable[active?.kind === "download" ? active.index : 0];
  const playerDialog = playbackDownload && (
    <VideoPlayerDialog
      contentEntry={contentEntry}
      download={playbackDownload}
      open={playerOpen}
      onClose={() => setPlayerOpen(false)}
      startSeconds={startSeconds}
    />
  );

  if (active?.kind === "download") {
    /*
      A poster that opens the player, rather than a second live player.

      The panel used to mount its own <video> as well as the dialog, and
      almost every playback bug came from those two existing at once - two
      copies playing over each other, a position that only carried across on
      the one route that had been wired for it, and a timeline that had to be
      kept in step in both places. One player, opened deliberately, removes
      the whole class rather than fixing each case.

      The poster is the affordance, so there is no separate button beside it:
      a picture of the video with a play control on it is already the thing
      you would press.
    */
    return (
      <Box sx={{ minWidth: 0 }}>
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Play ${contentInfo.title}`}
          onClick={() => playFrom(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              playFrom(undefined);
            }
          }}
          sx={{
            position: "relative",
            display: "block",
            cursor: "pointer",
            borderRadius: 1,
            overflow: "hidden",
            lineHeight: 0,
            "&:hover .play-overlay, &:focus-visible .play-overlay": { backgroundColor: "rgba(0, 0, 0, 0.45)" },
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
          }}
        >
          <Thumb src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)} alt={contentInfo.title} width="100%" />
          <Box
            className="play-overlay"
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
              transition: "background-color 150ms",
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 72, color: "common.white" }} />
          </Box>
        </Box>
        {switcher}
        {playerDialog}
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {active?.kind === "youtube" && contentInfo.youtubeVideoId ? (
        <YouTubeEmbed videoId={contentInfo.youtubeVideoId} width="100%" />
      ) : (
        <Thumb src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 600)} alt={contentInfo.title} width="100%" />
      )}
      {switcher}
      {playerDialog}
    </Box>
  );
};
