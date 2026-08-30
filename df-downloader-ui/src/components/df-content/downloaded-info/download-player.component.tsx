import CloseIcon from "@mui/icons-material/Close";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { Alert, Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { Chapter, DfContentEntry, DfContentInfoUtils, PlaybackInfo, secondsToHHMMSS } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisJump } from "../ai-analysis/analysis-jumps.ts";
import { CastButton } from "./cast-button.component.tsx";
import {
  pauseOtherPlayers,
  registerPlayer,
  rememberPlaybackPosition,
  rememberedPlaybackPosition,
  subscribePlaybackPosition,
} from "./playback-positions.ts";
import { apiIsCrossOrigin, getPlaybackInfo, playbackStreamUrl, playbackSubtitlesUrl } from "../../../api/playback.ts";
import { useQuery } from "../../../hooks/use-query.ts";
import { monoFontFamily } from "../../../themes/build-theme";

export type DownloadPlayerProps = {
  contentEntry: DfContentEntry;
  download: DfContentDownloadInfo;
  /** The dialog starts playing straight away; the content panel does not. */
  autoPlay?: boolean;
  /** Caps the video's height. The dialog wants a ceiling; a column does not. */
  maxHeight?: string;
  /**
   * Rendered directly under the video, above everything else - which is where
   * a control that changes what is playing belongs. Anything appended after
   * this whole component instead ends up below the chapters, far from the
   * thing it acts on.
   */
  belowVideo?: React.ReactNode;
  /**
   * "stacked" puts the chapter list under the video; "theater" puts it in a
   * rail beside it, so the video can be as large as the window allows without
   * the chapters being pushed off the bottom.
   */
  layout?: "stacked" | "theater";
  /**
   * Moments the AI analysis found, merged into the chapter list rather than
   * listed separately.
   *
   * Chapters and findings are the same kind of thing to someone watching -
   * places in this video - and two parallel lists meant reading both to
   * answer "what is next", with only one of them able to follow playback.
   * Interleaved, there is a single thing to scroll and a single row to
   * highlight. Passed in rather than fetched here because this component
   * knows about a file, not about an analysis.
   */
  analysisJumps?: AnalysisJump[];
  /**
   * Caps the timeline's own scroll area. The dialog leaves it uncapped and
   * lets the video stick to the top instead, so the list scrolls in the
   * dialog's own scroller; a panel embedded in a page wants a ceiling.
   */
  timelineMaxHeight?: number | string;
  /**
   * Hands the parent a way to drive playback, so something outside this
   * component can jump the video to a moment - the content panel uses it to
   * seek from its own analysis panel.
   *
   * Given as a callback rather than a ref because the parent only ever wants
   * to call it, never to read anything back.
   */
  onSeekReady?: (seek: (startMs: number) => void) => void;
  /**
   * Announces entering and leaving full screen.
   *
   * The host needs this to stop its layout changing underneath: going full
   * screen resizes the viewport, which can flip a media query, which can
   * swap this component to a different layout branch - remounting the very
   * element that is currently full screen.
   */
  onImmersiveChange?: (immersive: boolean) => void;
};

/**
 * Whether this browser can decode the file, asked of the browser itself.
 *
 * Deliberately a runtime check rather than a rule about codecs. HEVC
 * playback is not a property of the file, or even of the browser - it is a
 * property of the machine the browser is running on, since the decoder
 * usually comes from the OS. Measured while building this: Chrome 148 on
 * Windows 11 decodes 4K HEVC quite happily, which a "Chrome cannot do HEVC"
 * rule would have wrongly refused; the same build on a machine without the
 * OS codec would not. Only the browser in front of the user knows.
 *
 * An empty string is canPlayType's "no". "maybe" is treated as yes - it is
 * what a browser says when it will not commit without reading the file, and
 * the `error` event below is the backstop for when that optimism is wrong.
 */
const canBrowserPlay = (info: PlaybackInfo): boolean => {
  const probe = document.createElement("video");
  // Fall back to the bare MIME type when there is no codec string (an
  // encoding we have no representative probe for) - better to try and let the
  // error event catch it than to refuse something that would have played.
  return probe.canPlayType(info.codecProbe ?? info.mimeType) !== "";
};

/**
 * One list of places in the video, chapters and findings together.
 *
 * Chapters come from the file, findings come from the analysis, and to
 * someone watching they answer the same question - what happens next - so
 * they are interleaved rather than stacked as two lists. That also makes
 * following playback coherent: there is exactly one row that is "where we
 * are", instead of two lists each highlighting their own.
 *
 * They stay visually distinct: a chapter is the heading, findings sit
 * indented under the chapter they fall inside. Nothing enforces that
 * nesting - it falls out of sorting by time, which is the only relationship
 * that actually exists between them.
 */
type TimelineRow = {
  seconds: number;
  label: string;
  detail?: string;
  kind: "chapter" | "analysis";
};

const buildTimeline = (chapters: Chapter[], jumps: AnalysisJump[]): TimelineRow[] =>
  [
    ...chapters.map<TimelineRow>((chapter) => ({
      seconds: chapter.start / 1000,
      label: chapter.title,
      kind: "chapter",
    })),
    ...jumps.map<TimelineRow>((jump) => ({
      seconds: jump.seconds,
      label: jump.label,
      detail: jump.detail,
      kind: "analysis",
    })),
  ].sort((a, b) => {
    if (a.seconds !== b.seconds) {
      return a.seconds - b.seconds;
    }
    // A chapter starting at the same moment as a finding is the heading it
    // belongs under, so it goes first.
    if (a.kind === b.kind) {
      return 0;
    }
    return a.kind === "chapter" ? -1 : 1;
  });

/** The row you are inside - the last one that has started, not the nearest. */
const rowIndexAt = (rows: TimelineRow[], seconds: number) => {
  let index = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].seconds <= seconds) {
      index = i;
    } else {
      break;
    }
  }
  return index;
};

const timelineHeading = (chapters: number, findings: number) => {
  if (chapters && findings) {
    return `Timeline · ${chapters} chapters · ${findings} from the analysis`;
  }
  return chapters ? `Chapters · ${chapters}` : `From the analysis · ${findings}`;
};

const MediaTimeline = ({
  rows,
  activeIndex,
  onSeek,
  maxHeight,
  heading,
}: {
  rows: TimelineRow[];
  activeIndex: number;
  onSeek: (startMs: number) => void;
  maxHeight: number | string;
  heading: string;
}) => {
  /*
    Follows the video, but only as far as it has to.

    "nearest" rather than centring: the row is usually already on screen, and
    yanking the list to recentre it every time playback crosses a boundary is
    how a panel like this becomes something you scroll away from. Keyed on
    the index so it moves when the active row changes, not on every tick.
  */
  const activeRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (activeIndex < 0) {
      return;
    }
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" sx={{ color: "text.disabled" }}>
        {heading}
      </Typography>
      <Stack sx={{ maxHeight, overflowY: maxHeight === "none" ? undefined : "auto", marginTop: 0.5 }}>
        {rows.map((row, index) => {
          const active = index === activeIndex;
          const isChapter = row.kind === "chapter";
          return (
            <Box
              key={`${row.kind}-${row.seconds}-${row.label}`}
              ref={active ? activeRef : undefined}
              role="button"
              tabIndex={0}
              onClick={() => onSeek(row.seconds * 1000)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSeek(row.seconds * 1000);
                }
              }}
              sx={{
                display: "grid",
                gridTemplateColumns: "auto minmax(0, 1fr)",
                columnGap: 1.5,
                alignItems: "baseline",
                paddingY: isChapter ? 0.75 : 0.5,
                paddingRight: 1,
                // Findings are indented under the chapter above them, with a
                // rule running down the gutter so a run of them reads as one
                // group rather than as more chapters.
                paddingLeft: isChapter ? 1 : 3,
                marginLeft: isChapter ? 0 : 1,
                borderLeft: isChapter ? undefined : 2,
                borderColor: active ? "primary.main" : "divider",
                borderRadius: isChapter ? 1 : 0,
                cursor: "pointer",
                backgroundColor: active ? "action.selected" : undefined,
                "&:hover": { backgroundColor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
              }}
            >
              <Typography
                sx={{
                  fontFamily: monoFontFamily,
                  fontSize: "0.6875rem",
                  fontVariantNumeric: "tabular-nums",
                  color: isChapter ? "text.secondary" : "primary.main",
                }}
              >
                {secondsToHHMMSS(Math.floor(row.seconds))}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: "0.8125rem",
                    lineHeight: 1.35,
                    fontWeight: isChapter ? (active ? 700 : 600) : 400,
                  }}
                >
                  {row.label}
                </Typography>
                {row.detail && (
                  <Typography variant="caption" sx={{ color: "text.disabled", display: "block", lineHeight: 1.3 }}>
                    {row.detail}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

/**
 * Plays one downloaded file, with its subtitles and chapters.
 *
 * A plain `<video>` with the browser's own controls, deliberately: it
 * already gives seeking, volume, fullscreen, playback rate and a subtitle
 * menu, all of which would have to be rebuilt (and made accessible, and made
 * to work on a phone) to gain nothing. The only thing built on top is the
 * chapter list, since chapters are the one thing the element has no concept
 * of.
 *
 * There is deliberately no chapter marker strip under the scrubber. Segments
 * cannot be drawn into the native scrubber itself - the control bar is a
 * closed shadow DOM, so an overlay would be guessing at browser-specific
 * geometry and would sit on top of the real controls - and a second bar
 * beneath it just reads as two scrubbers. Genuine in-scrubber chapter
 * markers need a fully custom player, which is the trade-off this component
 * exists to avoid.
 *
 * Chapters arrive as `{title, start, end}` in milliseconds, read out of the
 * file with ffprobe at request time because they are embedded at download
 * time and never persisted to the DB.
 */
export const DownloadPlayer = ({
  contentEntry,
  download,
  autoPlay,
  maxHeight,
  belowVideo,
  layout = "stacked",
  analysisJumps,
  timelineMaxHeight = "none",
  onSeekReady,
  onImmersiveChange,
}: DownloadPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  // Identifies this player among any others mounted at the same time.
  const playerId = useRef(Symbol("player")).current;
  /*
    Immersive mode: the video filling the screen with the timeline available
    over the top of it.

    Fullscreen is requested on this wrapper rather than on the <video>, and
    that distinction is the whole feature. A fullscreened video element is
    handed to the browser's own fullscreen surface, which nothing can be
    drawn over - which is exactly what the player's native fullscreen button
    does, and why it cannot show the timeline. Fullscreening the element
    *containing* the video keeps both it and our overlay on screen together.

    The trade-off is that this only works where an arbitrary element can be
    fullscreened. iOS Safari allows it for video elements only, so the button
    is hidden there and the native control remains the way to fill the
    screen, just without the overlay.
  */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  /*
    Set when a full-screen request went nowhere.

    `fullscreenEnabled` promises only that the feature exists, not that this
    request will be honoured - and asking hides the player's own fullscreen
    button, so a refusal strands the user with a button that does nothing and
    no other way to fill the screen. A review found the request can also
    *hang*: no resolve, no reject, no event. So this is driven by "full screen
    did not happen", not by a rejected promise, and giving the native button
    back is the recovery.
  */
  const [immersiveRefused, setImmersiveRefused] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setImmersive(active);
      if (active) {
        // It worked after all - a slow transition, not a refusal.
        setImmersiveRefused(false);
      }
      /*
        Full screen starts as full screen - just the video. The timeline is a
        tap away, and the button over the picture is what says so, which is
        what auto-opening the panel was standing in for.
      */
      setOverlayOpen(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Separate from the listener above so the callback is never captured stale
  // by an effect that only runs once.
  useEffect(() => {
    onImmersiveChange?.(immersive);
  }, [immersive, onImmersiveChange]);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  // Captions are turned on once per file, not on every render - otherwise
  // switching them off in the player's own menu would be undone immediately.
  const captionsInitialisedFor = useRef<string | null>(null);

  const { data: info, loading, error } = useQuery({
    fetch: () => getPlaybackInfo(contentEntry.key, download.downloadLocation),
    triggerOnMount: true,
  });

  useEffect(() => {
    setPlaybackError(null);
    setPositionSeconds(0);
    captionsInitialisedFor.current = null;
  }, [download.downloadLocation]);

  const supported = useMemo(() => (info ? canBrowserPlay(info) : false), [info]);

  /*
    Subtitles on by default.

    The `default` attribute on the first <track> is the declarative half of
    this, but it is not reliable on its own here: the tracks are appended by
    React after the element exists, and a track added that way does not
    always get honoured. Setting mode explicitly once the track list is
    populated is what actually turns them on. Guarded so it happens once per
    file - after that the captions menu is the user's.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !info?.subtitleTracks.length || !supported) {
      return;
    }
    if (captionsInitialisedFor.current === download.downloadLocation) {
      return;
    }
    if (video.textTracks.length === 0) {
      return;
    }
    captionsInitialisedFor.current = download.downloadLocation;
    video.textTracks[0].mode = "showing";
  }, [info, supported, download.downloadLocation, layout]);

  /*
    Where the playhead is, in whole seconds.

    timeupdate fires about four times a second, and the timeline only needs
    to know which row it is inside, so the position is rounded and state only
    changes when the second does - a second is already finer than the rows
    are spaced. `seeked` as well as `timeupdate` so jumping while paused
    still moves the highlight.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const publish = () => {
      /*
        Nothing to say until the file is actually loaded.

        A video with no metadata reports currentTime 0, and a seek on it is
        discarded by the browser while still firing `seeked` - so an element
        still loading would broadcast a confident 0 that overwrote the real
        position other players had recorded, and then fail to restore itself
        because the position it read back was its own 0.
      */
      if (video.readyState < 1) {
        return;
      }
      const seconds = Math.floor(video.currentTime);
      setPositionSeconds((current) => (current === seconds ? current : seconds));
      rememberPlaybackPosition(download.downloadLocation, seconds, playerId);
    };
    video.addEventListener("timeupdate", publish);
    video.addEventListener("seeked", publish);
    return () => {
      video.removeEventListener("timeupdate", publish);
      video.removeEventListener("seeked", publish);
    };
  }, [supported, layout, download.downloadLocation, playerId]);

  /*
    Pick up where this file was left off.

    Once per file, on metadata rather than on mount - the duration is needed
    to tell "part way through" from "watched to the end", and with preload
    off there is nothing to seek in until then anyway.

    Two guards keep it from being worse than starting at zero: a position in
    the first few seconds is not worth restoring, and one near the end would
    drop you on the credits of something you already finished.
  */
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const restore = () => {
      if (restoredFor.current === download.downloadLocation) {
        return;
      }
      restoredFor.current = download.downloadLocation;
      const seconds = rememberedPlaybackPosition(download.downloadLocation);
      if (seconds == null || seconds < 5) {
        return;
      }
      if (Number.isFinite(video.duration) && seconds > video.duration - 15) {
        return;
      }
      video.currentTime = seconds;
    };
    video.addEventListener("loadedmetadata", restore);
    // Already loaded - a remount onto a cached file never fires the event.
    if (video.readyState >= 1) {
      restore();
    }
    return () => video.removeEventListener("loadedmetadata", restore);
  }, [supported, layout, download.downloadLocation]);

  /*
    Follows the same file being played somewhere else.

    Only while paused, and never from itself. The content panel plays inline
    and the dialog plays the same download, so whichever one is not being
    watched keeps up on its own - which means closing the dialog leaves the
    inline copy where you actually got to, no matter which of the several
    routes into the player was used. Catching up deliberately does not start
    playback: this is staying in sync, not a request to watch.
  */
  useEffect(() => {
    const location = download.downloadLocation;
    return subscribePlaybackPosition(location, (seconds, source) => {
      const video = videoRef.current;
      if (source === playerId || !video || !video.paused) {
        return;
      }
      // Seeking a video that has not loaded is discarded anyway, and doing it
      // pre-empts this player's own restore - see the publish guard above.
      if (video.readyState < 1) {
        return;
      }
      if (Math.abs(video.currentTime - seconds) < 2) {
        return;
      }
      video.currentTime = seconds;
    });
  }, [download.downloadLocation, playerId]);

  /*
    Hides the browser's own "Cast" entry, which cannot work here.

    Chrome offers casting from the video's overflow menu, and it hands the
    receiver the element's own src - which is this app's cookie-authed
    playback URL. The receiver has no cookie, so it gets a 401 and shows its
    idle screen: confirmed on a real device, where casting that way put the
    Chrome logo on the television and nothing else. An affordance that looks
    like the feature and silently fails is worse than no affordance, so it is
    turned off, and the Cast button beside the video - which mints a signed
    URL the receiver can actually fetch, and sideloads the subtitles - is the
    one that remains.

    Set as a property rather than an attribute because it is a boolean IDL
    attribute React does not know about. Deliberately NOT done through
    controlsList: that also switches off click-the-picture-to-pause, measured
    directly. This one does not - also measured, having learned the first time.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.disableRemotePlayback = true;
    }
  }, [supported, layout, download.downloadLocation]);

  /*
    One video at a time, wherever it was started from.

    Two copies of the same file playing over each other is never wanted, and
    this used to be handled only at the one call site that remembered to -
    the content panel paused its inline player when opening the dialog, while
    opening the same dialog from the Files tab left it playing behind the
    modal. A rule the player enforces itself cannot be forgotten by a new
    way of opening one.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const unregister = registerPlayer(playerId, video);
    const onPlay = () => pauseOtherPlayers(playerId);
    video.addEventListener("play", onPlay);
    return () => {
      video.removeEventListener("play", onPlay);
      unregister();
    };
  }, [playerId, supported, layout, download.downloadLocation]);

  const seekTo = useCallback((startMs: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = startMs / 1000;
    void video.play().catch(() => {
      // Autoplay policy can refuse this if nothing has been played yet. The
      // seek still happened, so the user can press play themselves.
    });
  }, []);

  // Effect rather than during render: handing a function to a parent is a
  // side effect, and doing it inline would fire on every render.
  useEffect(() => {
    onSeekReady?.(seekTo);
  }, [onSeekReady, seekTo]);


  const timelineRows = useMemo(
    () => buildTimeline(info?.chapters ?? [], analysisJumps ?? []),
    [info, analysisJumps]
  );
  const activeRow = useMemo(() => rowIndexAt(timelineRows, positionSeconds), [timelineRows, positionSeconds]);
  const hasTimeline = timelineRows.length > 0;
  /*
    The cap is per-place, not per-player: in a page the list needs a ceiling
    so it does not push everything below it off the bottom, but the immersive
    overlay is its own scroller filling the screen height, and capping it
    there would strand the list in a short box inside a tall panel.
  */
  const renderTimeline = (listMaxHeight: number | string) => (
    <MediaTimeline
      rows={timelineRows}
      activeIndex={activeRow}
      onSeek={seekTo}
      maxHeight={listMaxHeight}
      heading={timelineHeading(info?.chapters.length ?? 0, analysisJumps?.length ?? 0)}
    />
  );
  const timeline = hasTimeline && renderTimeline(timelineMaxHeight);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", paddingY: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (!info) {
    return null;
  }

  if (!supported) {
    return (
      <Alert severity="warning">
        <Typography variant="body2">
          This browser cannot play {info.videoCodec === "hevc" ? "HEVC" : info.videoCodec} video. Whether it plays
          depends on your operating system supplying a decoder rather than on the file, so the same download may play
          in a browser on another machine.
        </Typography>
        <Typography variant="body2" sx={{ marginTop: 1 }}>
          Play it from your media server, or open it directly:
        </Typography>
        <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", wordBreak: "break-all", marginTop: 0.5 }}>
          {download.downloadLocation}
        </Typography>
      </Alert>
    );
  }

  // Whether this browser will fullscreen an arbitrary element. iOS Safari
  // will not - it allows it for video elements only - so there the native
  // control has to stay, since ours cannot work.
  const canImmerse = typeof document !== "undefined" && document.fullscreenEnabled;

  const videoElement = (
    <Box
      component="video"
      // Keyed on the file so switching between two downloads rebuilds the
      // element rather than leaving the previous one's buffered state and
      // text tracks attached to a new source.
      key={download.downloadLocation}
      ref={videoRef}
      controls
      autoPlay={autoPlay}
      /*
        Nothing is fetched until play is pressed, when the player is sitting
        in a panel rather than one the user opened to watch.

        This is what keeps the poster on screen. A browser drops the poster
        the moment it has a frame to show instead, so merely setting one is
        not enough - with the file buffering on its own, the poster was
        replaced within a second by the video's own first frame, which for
        most of this content is a fade-in from black and so looks exactly
        like the blank rectangle the poster was added to avoid.

        Costs nothing on the play: the range request that starts playback was
        measured at 16ms to first frame. It does mean the duration is not
        known until then, which is why the panel shows it in the header.
      */
      preload={autoPlay ? "auto" : "none"}
      /*
        The control bar keeps its own fullscreen button, deliberately.

        It was hidden with controlsList for a while, to leave ours as the
        only one - that button fullscreens the video element itself, which
        the browser hands to a surface nothing can be drawn over, so it
        silently produces a full screen with no timeline. But setting
        controlsList also switches off Chrome's click-the-picture-to-pause,
        measured directly: same click, same spot, playing throughout with the
        attribute set and paused without it. Losing the ordinary way to pause
        a video is a far worse trade than having two fullscreen buttons that
        do slightly different things.
      */
      /*
        Only when the API really is on another origin - see apiIsCrossOrigin.
        Setting this unconditionally also forces the poster through CORS, and
        DF's thumbnail host sends no CORS headers, so the poster silently
        fails and the player goes back to being a black rectangle.
      */
      crossOrigin={apiIsCrossOrigin() ? "use-credentials" : undefined}
      /*
        The content's own thumbnail stands in until playback starts, rather
        than a black rectangle - which is what a paused video with no poster
        shows, and which reads as something having failed to load.

        No error handling is possible here (the poster attribute has no
        error event), and getThumbnailUrl can return a YouTube
        "maxresdefault" that 404s for older uploads. That degrades to
        exactly the black frame this replaces, so it is worth having anyway
        - but it is why this is not the place to rely on a thumbnail being
        present. DfThumbnailImage is the component that retries at a lower
        resolution.
      */
      poster={DfContentInfoUtils.getThumbnailUrl(contentEntry.contentInfo, 1200, 600) || undefined}
      onError={() => {
        // The backstop for an optimistic canPlayType: the element only finds
        // out it cannot decode once it has actually read the file.
        setPlaybackError(
          "This file could not be played in the browser. Its codec is probably not supported on this machine."
        );
      }}
      src={playbackStreamUrl(contentEntry.key, download.downloadLocation)}
      sx={{
        width: "100%",
        // Immersive fills the screen and letterboxes rather than cropping;
        // the ordinary case is capped so the timeline below stays in view.
        maxHeight: immersive ? "100%" : maxHeight ?? "60vh",
        height: immersive ? "100%" : undefined,
        objectFit: immersive ? "contain" : undefined,
        minHeight: 0,
        backgroundColor: "common.black",
        borderRadius: immersive ? 0 : 1,
      }}
    >
      {info.subtitleTracks.map((track, index) => (
        <track
          key={`subs-${track.index}`}
          kind="subtitles"
          // Served as WebVTT - browsers do not parse SRT, so the sidecar is
          // converted on the way out.
          src={playbackSubtitlesUrl(contentEntry.key, download.downloadLocation, track.index)}
          srcLang={track.language}
          label={track.label}
          default={index === 0}
        />
      ))}
    </Box>
  );

  /*
    Everything that has to be inside the fullscreen element.

    Only the fullscreened element and its descendants are rendered while
    fullscreen is active, so the overlay has to live in here rather than
    beside the video.
  */

  const stage = (
    <Box
      ref={stageRef}
      onClick={
        immersive
          ? (event) => {
              /*
                Tap the picture to summon the timeline - but not on the strip
                the native controls occupy. Those controls live in the video's
                shadow DOM, so a press on play or the scrubber arrives here as
                a click on the video itself and is indistinguishable from a tap
                on the picture. Excluding the band they sit in is the only
                thing that separates them, and it costs nothing: that band is
                letterboxing most of the time.
              */
              const rect = event.currentTarget.getBoundingClientRect();
              /*
                A share of the height, capped - not a flat 96px. Measured on a
                phone held sideways, 96px is a quarter of the stage, so a
                quarter of the picture did nothing. The control bar does not
                grow as the screen shrinks, so the cap is what matters on a
                desktop and the proportion is what matters on a handset.
              */
              const band = Math.min(96, rect.height * 0.12);
              if (rect.bottom - event.clientY < band) {
                return;
              }
              setOverlayOpen((open) => !open);
            }
          : undefined
      }
      sx={{
        position: "relative",
        minWidth: 0,
        ...(immersive && {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "common.black",
        }),
      }}
    >
      {videoElement}
      {/* Not while immersive: the two buttons up there are already the exit
          and the timeline, and casting is a thing you do instead of watching
          here rather than while filling this screen. */}
      {!immersive && (
        <CastButton
          contentEntry={contentEntry}
          download={download}
          currentSeconds={positionSeconds}
          videoCodec={info.videoCodec}
        />
      )}
      {canImmerse && !immersiveRefused && (
        <Tooltip title={immersive ? "Leave full screen" : "Full screen - tap the picture for the timeline"}>
          <IconButton
            size="small"
            onClick={(event) => {
              // Without this the tap handler above would toggle the overlay
              // on the way out.
              event.stopPropagation();
              if (immersive) {
                void document.exitFullscreen();
              } else {
                const stage = stageRef.current;
                if (!stage?.requestFullscreen) {
                  setImmersiveRefused(true);
                  return;
                }
                stage.requestFullscreen().catch(() => setImmersiveRefused(true));
                // The backstop for a request that never answers at all.
                window.setTimeout(() => {
                  if (document.fullscreenElement !== stage) {
                    setImmersiveRefused(true);
                  }
                }, 1200);
              }
            }}
            aria-label={immersive ? "Leave full screen" : "Full screen"}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              // Above the panel, for the same reason as the button beside it.
              zIndex: 2,
              color: "common.white",
              backgroundColor: "rgba(0, 0, 0, 0.45)",
              "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.7)" },
            }}
          >
            {immersive ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      {immersive && hasTimeline && (
        <Tooltip title={overlayOpen ? "Hide the timeline" : "Show the timeline"}>
          <IconButton
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              setOverlayOpen((open) => !open);
            }}
            aria-label={overlayOpen ? "Hide the timeline" : "Show the timeline"}
            sx={{
              position: "absolute",
              top: 8,
              right: 52,
              // Above the panel. The panel is full width on a phone and
              // swallows taps so they do not reach the video behind it, so
              // if it covers this button there is no way to dismiss it at
              // all - which is exactly what happened.
              zIndex: 2,
              color: "common.white",
              backgroundColor: "rgba(0, 0, 0, 0.45)",
              "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.7)" },
            }}
          >
            {/* A close box while it is open - a list icon reads as "show me
                the list" whichever state it is in. */}
            {overlayOpen ? <CloseIcon fontSize="small" /> : <FormatListBulletedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      )}
      {immersive && overlayOpen && hasTimeline && (
        <Box
          // A tap inside the panel is for the panel - seeking, scrolling -
          // and must not be read as a tap on the picture behind it.
          onClick={(event) => event.stopPropagation()}
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            /*
              Never the full width, so there is always picture left to tap.

              Tapping the video toggles this panel, which only works while
              some video is reachable - at full width every tap landed on the
              panel, which stops taps so they do not fall through to the
              video, and the gesture that opened it could not close it.
            */
            width: { xs: "78%", sm: 420 },
            maxWidth: "78%",
            overflowY: "auto",
            padding: 2,
            // Clear of the buttons floating over its top-right corner.
            paddingTop: 7,
            zIndex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(8px)",
          }}
        >
          {renderTimeline("none")}
        </Box>
      )}
    </Box>
  );

  const errorBanner = playbackError && (
    <Alert severity="error">
      <Typography variant="body2">{playbackError}</Typography>
      <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", wordBreak: "break-all", marginTop: 0.5 }}>
        {download.downloadLocation}
      </Typography>
    </Alert>
  );

  const embeddedNote = info.embeddedSubtitlesOnly && (
    <Typography variant="body2" color="text.disabled">
      This file's subtitles are embedded in it, which browsers cannot read. Generate them again with the separate .srt
      output to get captions here.
    </Typography>
  );

  if (layout === "theater") {
    return (
      <Stack spacing={2} sx={{ minWidth: 0, height: "100%" }}>
        {errorBanner}
        <Box
          sx={{
            display: "flex",
            gap: 2,
            minHeight: 0,
            flex: "1 1 auto",
            // The rail drops under the video rather than squeezing it on a
            // narrow window - two 300px columns is not a theater.
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          <Box
            sx={{
              minWidth: 0,
              flex: "1 1 auto",
              display: "flex",
              flexDirection: "column",
              // Centred in the column rather than pinned to its top: the
              // video is capped by its own aspect ratio, so in a tall window
              // anchoring it to the top leaves it stranded above a large
              // empty space with the rail running past it.
              justifyContent: "center",
            }}
          >
            {stage}
            {belowVideo}
            {embeddedNote}
          </Box>
          {timeline && (
            <Box
              sx={{
                width: { xs: "100%", md: 360 },
                flexShrink: 0,
                minHeight: 0,
                // The rail is the scroller, so the timeline fills the height
                // the theater window has rather than a fixed crop.
                overflowY: "auto",
              }}
            >
              {timeline}
            </Box>
          )}
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {errorBanner}
      {/*
        The video stays put while the chapters and analysis scroll beneath
        it. Those lists are how you navigate the thing you are watching, so
        scrolling them must not push the video off the screen - which is
        exactly what happened when the whole column scrolled as one block.

        Sticky rather than a fixed-height flex column because this component
        does not own its scroll container: it renders inside a dialog in one
        place and a tab panel in another, and sticky works in both without
        either having to be restructured. The background is opaque so the
        list passing underneath does not show through.
      */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          backgroundColor: "background.paper",
          // The Stack's own gap would otherwise leave a transparent strip
          // for content to show through as it scrolls past.
          pb: 1,
        }}
      >
        {stage}
        {belowVideo}
      </Box>
      {embeddedNote}
      {timeline}
    </Stack>
  );
};
