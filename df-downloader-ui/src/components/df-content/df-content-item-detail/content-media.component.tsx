import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ReplayIcon from "@mui/icons-material/Replay";
import { Box, Button, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { WatchElsewhereDialog } from "../downloaded-info/watch-elsewhere.component.tsx";
import { DfContentEntry, DfContentInfoUtils, STARTED_FRACTION, WatchState, secondsToHHMMSS } from "df-downloader-common";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VideoPlayerDialog } from "../downloaded-info/video-player-dialog.component.tsx";
import { Thumb } from "../../general/thumb.component.tsx";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";
import { fetchWatchState } from "../../../api/watch-state.ts";
import { rememberedPlaybackPosition } from "../downloaded-info/playback-positions.ts";

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
  /** Fires as the player opens and closes - see the effect that calls it. */
  onPlayerOpenChange?: (open: boolean) => void;
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
export const ContentMedia = ({ contentEntry, onPlayFromReady, onPlayerOpenChange }: ContentMediaProps) => {
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
  /*
   * Announced upward so the layout above can hold still while it is open.
   *
   * This panel is rendered in two different places depending on the layout,
   * so a breakpoint flip unmounts it and everything under it - which on a
   * phone whose landscape width lands just the wrong side of that breakpoint
   * meant entering fullscreen closed the player. See the note on `stacked`.
   */
  useEffect(() => {
    onPlayerOpenChange?.(playerOpen);
  }, [playerOpen, onPlayerOpenChange]);
  /*
   * Plex and Jellyfin are more places this same video can come from, so they
   * belong beside the source picker rather than buried in a file's actions -
   * which is where they were, and where nobody looked for them.
   *
   * Only for a downloaded source: a YouTube embed is not a file any media
   * server holds.
   */
  const [watchElsewhereOpen, setWatchElsewhereOpen] = useState(false);
  const activeDownload = active?.kind === "download" ? playable[active.index] : undefined;
  const [startSeconds, setStartSeconds] = useState<number | undefined>(undefined);

  const playFrom = useCallback((seconds?: number) => {
    setStartSeconds(seconds);
    setPlayerOpen(true);
  }, []);

  /*
   * Where you got to, so the poster can say so before you press it.
   *
   * Re-read as the player closes as well as on mount: having just watched
   * twenty minutes, the position the button offers should be the one you
   * stopped at, not the one you arrived with.
   */
  const [watchState, setWatchState] = useState<WatchState | undefined>(undefined);
  useEffect(() => {
    if (playerOpen) {
      return;
    }
    let cancelled = false;
    fetchWatchState(contentEntry.key)
      .then((state) => {
        if (!cancelled) {
          setWatchState(state);
        }
      })
      .catch(() => {
        // Nothing to show is the same as not knowing: the poster just plays.
      });
    return () => {
      cancelled = true;
    };
  }, [contentEntry.key, playerOpen]);

  /*
   * Whether there is a part-watched position worth offering, and where.
   *
   * The tab's own memory wins when it has an answer, for the same reason it
   * does inside the player: it is this session, to the second, while the
   * service's copy is a poll behind. STARTED_FRACTION is the shared line
   * every other watched marker in the app is drawn at, so the poster cannot
   * offer to resume something the row badges call unwatched. The floor of
   * five seconds matches the player, which ignores anything closer to the
   * start than that - offering a resume it would then decline to honour is
   * worse than not offering one.
   */
  const resume = useMemo(() => {
    const local = activeDownload ? rememberedPlaybackPosition(activeDownload.downloadLocation) : undefined;
    const seconds = local ?? watchState?.positionSeconds;
    const duration = watchState?.durationSeconds || DfContentInfoUtils.getDurationSeconds(contentInfo);
    if (seconds == null || seconds < 5 || !duration || duration <= 0) {
      return undefined;
    }
    const fraction = Math.min(1, seconds / duration);
    if (watchState?.watched || fraction <= STARTED_FRACTION) {
      return undefined;
    }
    return { seconds, fraction };
    // playerOpen is a dependency because rememberedPlaybackPosition is a
    // plain Map read, not reactive: closing the player is the moment its
    // answer changes, and the refetch above may legitimately never land.
  }, [activeDownload, watchState, contentInfo, playerOpen]);
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

  /*
   * Rendered even when there is only one source to switch between: the row is
   * about where this video can be watched, and "elsewhere" is an answer to
   * that whether or not there is a second source on this machine.
   */
  const switcher = (sources.length > 1 || activeDownload) && (
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
      {activeDownload && (
        <Button
          size="small"
          variant="text"
          startIcon={<OpenInNewIcon />}
          onClick={() => setWatchElsewhereOpen(true)}
          sx={{ textTransform: "none", fontSize: "0.75rem" }}
        >
          Watch elsewhere
        </Button>
      )}
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

  const watchElsewhereDialog = activeDownload && (
    <WatchElsewhereDialog
      contentEntry={contentEntry}
      download={activeDownload}
      open={watchElsewhereOpen}
      onClose={() => setWatchElsewhereOpen(false)}
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

      Part-watched is the exception. Pressing the poster there has always
      resumed, silently - which is right most of the time and wrong exactly
      when you wanted to start the thing again, with no way to say so. So the
      poster now shows where it would pick up, and the two intentions get a
      button each underneath it.
    */
    return (
      <Box sx={{ minWidth: 0 }}>
        <Box
          role="button"
          tabIndex={0}
          aria-label={
            resume
              ? `Resume ${contentInfo.title} at ${secondsToHHMMSS(Math.floor(resume.seconds))}`
              : `Play ${contentInfo.title}`
          }
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
          <Thumb src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 675)} alt={contentInfo.title} width="100%" />
          <Box
            className="play-overlay"
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
              transition: "background-color 150ms",
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 72, color: "common.white" }} />
            {resume && (
              <Typography
                sx={{
                  paddingX: 0.75,
                  paddingY: 0.25,
                  borderRadius: 0.5,
                  backgroundColor: "rgba(0, 0, 0, 0.6)",
                  color: "common.white",
                  fontSize: "0.75rem",
                }}
              >
                Resume at {secondsToHHMMSS(Math.floor(resume.seconds))}
              </Typography>
            )}
          </Box>
          {/*
            The same 3px bar the grid cards draw, for the same reason and in
            the same colour: how far through you are is a property of the
            video, and it should not look like a different fact here.
          */}
          {resume && (
            <Box
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "3px",
                backgroundColor: "rgba(0, 0, 0, 0.45)",
              }}
            >
              <Box sx={{ width: `${resume.fraction * 100}%`, height: "100%", backgroundColor: "primary.main" }} />
            </Box>
          )}
        </Box>
        {resume && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, marginTop: 1, flexWrap: "wrap" }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => playFrom(undefined)}
              sx={{ textTransform: "none" }}
            >
              Resume from {secondsToHHMMSS(Math.floor(resume.seconds))}
            </Button>
            {/*
              Zero rather than undefined, and the difference matters: the
              player treats an explicit moment as a deliberate request and
              seeks to it, while undefined means "wherever I left off".
            */}
            <Button
              size="small"
              variant="text"
              startIcon={<ReplayIcon />}
              onClick={() => playFrom(0)}
              sx={{ textTransform: "none" }}
            >
              Play from the start
            </Button>
          </Box>
        )}
        {switcher}
        {playerDialog}
      {watchElsewhereDialog}
      </Box>
    );
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {active?.kind === "youtube" && contentInfo.youtubeVideoId ? (
        <YouTubeEmbed videoId={contentInfo.youtubeVideoId} width="100%" />
      ) : (
        <Thumb src={DfContentInfoUtils.getThumbnailUrl(contentInfo, 1200, 675)} alt={contentInfo.title} width="100%" />
      )}
      {switcher}
      {playerDialog}
      {watchElsewhereDialog}
    </Box>
  );
};
