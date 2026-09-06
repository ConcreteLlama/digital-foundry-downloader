import { Alert, Box, Button, CircularProgress, Divider, IconButton, Menu, MenuItem, Popover, Slider, Stack, Tooltip, Typography } from "@mui/material";
import ClosedCaptionIcon from "@mui/icons-material/ClosedCaption";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VolumeOffIcon from "@mui/icons-material/VolumeOff";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";
import { Chapter, DfContentEntry, DfContentInfoUtils, PlaybackInfo, secondsToHHMMSS } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisJump } from "../ai-analysis/analysis-jumps.ts";
import { rememberPlaybackPosition, rememberedPlaybackPosition } from "./playback-positions.ts";
import { fetchWatchState } from "../../../api/watch-state.ts";
import {
  apiIsCrossOrigin,
  getPlaybackInfo,
  reportPlaybackProgress,
  playbackEmbeddedSubtitlesUrl,
  playbackStreamUrl,
  playbackSubtitlesUrl,
  playbackTranscodeUrl,
} from "../../../api/playback.ts";
import { useSelector } from "react-redux";
import { selectConfigSection } from "../../../store/config/config.selector.ts";
import { useQuery } from "../../../hooks/use-query.ts";
import { monoFontFamily } from "../../../themes/build-theme";

/** How much playback has to move before the service is told again. */
const REPORT_INTERVAL_SECONDS = 10;

/**
 * Seeks to a remembered position, with the two guards that keep resuming from
 * being worse than starting at zero: a position in the first few seconds is
 * not worth restoring, and one near the end drops you on the credits of
 * something you already finished.
 */
const applyResume = (video: HTMLVideoElement, seconds: number) => {
  if (seconds < 5) {
    return;
  }
  if (Number.isFinite(video.duration) && seconds > video.duration - 15) {
    return;
  }
  video.currentTime = seconds;
};

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
   * Start here rather than where this file was last left off.
   *
   * Used when playback is opened from an analysis timestamp: the reader
   * asked for a particular moment, which beats resuming.
   */
  startSeconds?: number;
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
 * One stream's line in the playback details.
 *
 * The codec on its own answers nothing - what a viewer wants to know is
 * whether their browser can take it and what is being done about it if not,
 * so the verdict sits next to the fact rather than being left to infer.
 */
const DetailRow = ({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note: string;
  warn?: boolean;
}) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
    <Typography variant="caption" color="text.secondary" sx={{ minWidth: "3.5rem" }}>
      {label}
    </Typography>
    <Stack sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontFamily: monoFontFamily }}>
        {value}
      </Typography>
      <Typography variant="caption" color={warn ? "warning.main" : "text.disabled"}>
        {note}
      </Typography>
    </Stack>
  </Stack>
);

/**
 * The same question for the sound, which is the one that actually bites.
 *
 * Digital Foundry's downloads carry AC-3, which no browser decodes - so a file
 * whose video plays perfectly gives picture and silence. That was invisible
 * until the probe started reporting an audio codec at all: nothing here knew
 * a file even had one.
 *
 * Absent probe means "cannot tell", and cannot-tell is treated as playable on
 * the same reasoning as the video check - the element's own error event and,
 * failing that, the viewer's ears are the backstop, and refusing something
 * that would have played is the worse mistake.
 */
const canBrowserPlayAudio = (info: PlaybackInfo): boolean => {
  if (!info.audioCodecProbe) {
    return true;
  }
  const probe = document.createElement("video");
  return probe.canPlayType(info.audioCodecProbe) !== "";
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
  startSeconds,
}: DownloadPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  /*
   * Where the current transcoded stream begins, in whole seconds of the file.
   *
   * A transcoded stream is generated as it is sent, so its timeline starts at
   * zero wherever it was asked to begin - the element's currentTime is
   * therefore an offset into the stream, not a position in the video. Seeking
   * means asking for a new stream and moving this.
   *
   * Kept as a ref as well as state: the position and progress effects read it
   * from inside event handlers that must not be torn down and rebuilt every
   * time it changes.
   */
  const [streamOffset, setStreamOffset] = useState(0);
  const streamOffsetRef = useRef(0);
  streamOffsetRef.current = streamOffset;
  const [playing, setPlaying] = useState(false);
  // Read from inside long-lived event handlers, which must not be rebuilt
  // whenever these change - see the position and progress effects.
  /*
   * State for the replacement transport.
   *
   * All of it exists only because switching the native controls off takes
   * away everything, not just the scrubber - the centre play button, volume,
   * fullscreen and the captions menu go with it. A bar that removes those
   * without putting them back is worse than the wrong scrubber it was meant
   * to fix.
   */
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(false);
  /*
   * Bumped to ask for the stream again after a failure.
   *
   * The URL has to actually change or the element will not re-request it, and
   * neither the file nor the offset has - only our willingness to try again.
   */
  const [retryNonce, setRetryNonce] = useState(0);
  const [detailsAnchor, setDetailsAnchor] = useState<HTMLElement | null>(null);
  const [captionsAnchor, setCaptionsAnchor] = useState<HTMLElement | null>(null);
  const [activeTrack, setActiveTrack] = useState(0);
  const transcodingRef = useRef(false);
  const probedDurationRef = useRef<number | undefined>(undefined);
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
    setStreamOffset(0);
    captionsInitialisedFor.current = null;
  }, [download.downloadLocation]);

  const playerConfig = useSelector(selectConfigSection("player"));

  /*
   * Whether the browser can take this file as it stands, and whether we may
   * do anything about it if not.
   *
   * Video and audio are asked separately because they fail separately, and
   * the audio case is both the common one and the one that used to be
   * invisible: picture with no sound and nothing to explain it.
   */
  const videoSupported = useMemo(() => (info ? canBrowserPlay(info) : false), [info]);
  const audioSupported = useMemo(() => (info ? canBrowserPlayAudio(info) : true), [info]);
  const transcodingAllowed = playerConfig?.transcode !== "never";
  /*
   * "always" exists to exercise the re-encoding path deliberately. Without
   * it that path is unreachable on a library the browser can already play,
   * which is most of one - so a bug in it would only ever be found by
   * whoever first owned an unusual file.
   */
  const transcoding =
    Boolean(info) && transcodingAllowed && (playerConfig?.transcode === "always" || !videoSupported || !audioSupported);
  /*
   * "Supported" now means "there is some way to play this", which is what
   * every guard downstream actually wanted. Without transcoding it still
   * means the file plays directly; with it, a file the browser cannot decode
   * is playable after all, and the open-externally path is for when even that
   * is unavailable.
   */
  const supported = videoSupported || transcoding;
  transcodingRef.current = transcoding;
  probedDurationRef.current = info?.durationSeconds;

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
      // Offset because a transcoded stream's zero is wherever it was asked to
      // start - see streamOffset. Zero on the direct path.
      const seconds = Math.floor(streamOffsetRef.current + video.currentTime);
      setPositionSeconds((current) => (current === seconds ? current : seconds));
      rememberPlaybackPosition(download.downloadLocation, seconds);
    };
    video.addEventListener("timeupdate", publish);
    video.addEventListener("seeked", publish);
    return () => {
      video.removeEventListener("timeupdate", publish);
      video.removeEventListener("seeked", publish);
    };
  }, [supported, layout, download.downloadLocation]);

  /*
    Report progress to the service, which passes it to any media server set up
    for play state.

    Throttled hard. `timeupdate` fires about four times a second and each
    report is a request that may fan out to two media servers, so it only
    speaks every REPORT_INTERVAL_SECONDS of movement - plus immediately on
    pause, on ending, and when the player closes, which are the moments that
    actually matter for a resume point.

    Failures are swallowed on purpose. Nothing here is worth interrupting a
    video for, and the service already logs what went wrong.
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !supported) {
      return;
    }
    const contentKey = contentEntry.key;
    const { downloadLocation } = download;
    let lastReportedSecond = Number.NEGATIVE_INFINITY;
    const send = (force: boolean) => {
      /*
       * The whole video's length, which the element cannot supply on the
       * transcoded path - a stream generated from halfway through reports the
       * remainder, and reporting that as the duration would tell a media
       * server the video is shorter than it is and mark it watched early.
       */
      const totalSeconds = transcodingRef.current ? probedDurationRef.current : video.duration;
      if (video.readyState < 1 || !Number.isFinite(totalSeconds) || !totalSeconds || totalSeconds <= 0) {
        return;
      }
      const seconds = Math.floor(streamOffsetRef.current + video.currentTime);
      if (!force && Math.abs(seconds - lastReportedSecond) < REPORT_INTERVAL_SECONDS) {
        return;
      }
      lastReportedSecond = seconds;
      void reportPlaybackProgress(contentKey, downloadLocation, seconds, Math.floor(totalSeconds)).catch(
        () => {}
      );
    };
    const onTimeUpdate = () => send(false);
    const onStopped = () => send(true);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onStopped);
    video.addEventListener("ended", onStopped);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onStopped);
      video.removeEventListener("ended", onStopped);
      // Closing the player is exactly when the resume point matters most.
      send(true);
    };
  }, [supported, contentEntry.key, download.downloadLocation]);

  /*
    Pick up where this file was left off.

    Once per file, on metadata rather than on mount - the duration is needed
    to tell "part way through" from "watched to the end", and with preload
    off there is nothing to seek in until then anyway.

    Two guards keep it from being worse than starting at zero: a position in
    the first few seconds is not worth restoring, and one near the end would
    drop you on the credits of something you already finished.
  */
  /*
    Where the service says you got to.

    Fetched rather than read from the map because the map only lasts as long
    as the tab: before this, closing the browser lost your place in everything.
    Held in a ref rather than state because nothing renders from it - it is
    consulted once, at the moment the file is ready to seek.
  */
  const serverPosition = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    serverPosition.current = null;
    fetchWatchState(contentEntry.key)
      .then((state) => {
        if (cancelled || !state) {
          return;
        }
        serverPosition.current = state.positionSeconds;
        const video = videoRef.current;
        /*
          Metadata may already have loaded and found nothing to restore, in
          which case this answer arrived too late for the effect below. Seek
          now instead - but only from a standing start, so this can never
          yank someone who has already started watching or scrubbed.
        */
        if (video && video.readyState >= 1 && video.currentTime < 5) {
          applyResume(video, state.positionSeconds);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contentEntry.key, download.downloadLocation]);

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
      // An explicitly requested moment wins: someone clicked a timestamp.
      if (startSeconds != null) {
        video.currentTime = startSeconds;
        return;
      }
      /*
        The tab's own memory first, then what the service knows.

        The in-memory map is the better answer when it has one - it is this
        session, to the second - but it dies with the tab, and the service's
        copy is what survives a reload or a different device.
      */
      const seconds = rememberedPlaybackPosition(download.downloadLocation) ?? serverPosition.current;
      if (seconds == null) {
        return;
      }
      applyResume(video, seconds);
    };
    video.addEventListener("loadedmetadata", restore);
    // Already loaded - a remount onto a cached file never fires the event.
    if (video.readyState >= 1) {
      restore();
    }
    return () => video.removeEventListener("loadedmetadata", restore);
  }, [supported, layout, download.downloadLocation, startSeconds]);

  /*
    Hides the browser's own "Cast" entry, which cannot work here.

    Chrome offers casting from the video's overflow menu, and it hands the
    receiver the element's own src - this app's cookie-authed playback URL.
    The receiver has no cookie, gets a 401, and shows its idle screen:
    confirmed on a real device, where casting that way put the Chrome logo on
    the television and nothing else. There is no in-app cast to offer instead
    (see ROADMAP item 11 for why that was built, measured and dropped), but an
    affordance that looks like the feature and silently fails is still worse
    than none - casting these files is a job for a media server pointed at the
    same directory, which also transcodes for receivers that cannot decode
    them.

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
   * The one place the two playback paths genuinely differ.
   *
   * A direct file is seekable by byte range, so moving within it is what the
   * element already does well. A transcoded stream is generated as it is
   * sent, so the bytes for a later moment do not exist yet and the only way
   * there is to ask for a new stream starting from that point.
   *
   * This is also what chapter and finding jumps call - they predate
   * transcoding, and without the branch below a jump on a re-encoded file
   * would move within the fragment instead of the video, landing somewhere
   * unrelated to the chapter that was clicked.
   */
  const seekTo = useCallback(
    (startMs: number) => {
      const seconds = Math.max(0, Math.floor(startMs / 1000));
      setPositionSeconds(seconds);
      if (transcodingRef.current) {
        // The reload starts paused; onLoadedMetadata resumes it when it was
        // playing, and a jump from a chapter list should start playing too.
        setPlaying(true);
        setStreamOffset(seconds);
        return;
      }
      const video = videoRef.current;
      if (!video) {
        return;
      }
      video.currentTime = seconds;
      void video.play().catch(() => {
        // Autoplay policy can refuse this if nothing has been played yet. The
        // seek still happened, so the user can press play themselves.
      });
    },
    []
  );

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
    so it does not push everything below it off the bottom, but the dialog
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

  const videoSurface = (
    <Box
      component="video"
      // Keyed on the file so switching between two downloads rebuilds the
      // element rather than leaving the previous one's buffered state and
      // text tracks attached to a new source.
      key={download.downloadLocation}
      ref={videoRef}
      /*
        Our transport, not the browser's, for every file.

        It began as a transcode-only replacement, because the element's own
        bar is driven by its own timeline and a transcoded stream starts
        wherever it was generated from - so the scrubber showed the remaining
        video as though it were the whole thing. But having two different
        players depending on which file you opened is worse than either one,
        so the same bar now drives both and only the seek differs underneath.

        What that costs is the things the native bar gave away free: keyboard
        shortcuts, playback speed and picture-in-picture. Shortcuts are put
        back below; the other two are not, and would have to be built if they
        turn out to be missed.
      */
      controls={false}
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
      /*
        16:9 to match the video behind it. This asked for 1200x600 and was
        silently handed a 16:9 image anyway - the resize was a no-op against
        the current URL shape, so every caller got the scraped 300x169
        original upscaled. Now that the size is honoured, asking for 2:1
        would produce a poster genuinely shaped differently to the video it
        stands in for, which is not what it was doing before and not what is
        wanted.
      */
      poster={DfContentInfoUtils.getThumbnailUrl(contentEntry.contentInfo, 1200, 675) || undefined}
      onError={() => {
        // The backstop for an optimistic canPlayType: the element only finds
        // out it cannot decode once it has actually read the file.
        /*
         * Two very different causes, and the wrong message sent someone
         * looking at the file. On the transcoded path a failure usually is
         * not the codec at all - it is the machine already re-encoding as
         * many videos as it is allowed to, which is temporary and worth
         * saying so, where "your codec is unsupported" reads as permanent.
         */
        setPlaybackError(
          transcoding
            ? "This video could not be re-encoded for playback just now. The machine may already be busy re-encoding others - wait a moment and try again."
            : "This file could not be played in the browser. Its codec is probably not supported on this machine."
        );
      }}
      /*
        The transcoded stream carries its starting point in the URL, so
        changing streamOffset is what performs a seek - the element reloads
        and begins again from there. onLoadedMetadata resumes playback across
        that reload, which is what makes a seek feel like a seek.
      */
      src={
        transcoding
          ? `${playbackTranscodeUrl(contentEntry.key, download.downloadLocation, streamOffset)}${
              retryNonce ? `&r=${retryNonce}` : ""
            }`
          : playbackStreamUrl(contentEntry.key, download.downloadLocation)
      }
      onLoadedMetadata={() => {
        const video = videoRef.current;
        if (video && transcoding && playing) {
          void video.play().catch(() => {});
        }
      }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      /*
        Fills whatever the frame gives it, and decides nothing about layout.

        Sizing used to come from the video itself, which meant the page moved
        whenever the video's intrinsic size was unknown - and on a seek it is
        unknown for a moment every single time, because the element is torn
        down and rebuilt. The frame below owns the space instead, so a reload,
        a different resolution or a file that never loads at all all leave the
        layout exactly where it was.
      */
      sx={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        minHeight: 0,
        display: "block",
      }}
    >
      {info.subtitleTracks.map((track, index) => (
        <track
          // Source included: a sidecar and an embedded stream can both be
          // index 0, and keying on the number alone collapses them into one.
          // Offset in the key so a seek refetches the cues re-timed to the new
          // stream: React would otherwise keep the element and its old cues,
          // and the subtitles would be wrong by however far you jumped.
          key={`subs-${track.source}-${track.index}-${streamOffset}`}
          kind="subtitles"
          // Served as WebVTT either way - browsers parse neither SRT nor a
          // stream inside the container, so both are converted on the way out.
          src={
            track.source === "embedded"
              ? playbackEmbeddedSubtitlesUrl(
                  contentEntry.key,
                  download.downloadLocation,
                  track.index,
                  streamOffset
                )
              : playbackSubtitlesUrl(contentEntry.key, download.downloadLocation, track.index, streamOffset)
          }
          srcLang={track.language}
          label={track.label}
          default={index === 0}
        />
      ))}
    </Box>
  );

  /*
   * Our own transport, for the transcoded path only.
   *
   * Everything here exists because the element's timeline is not the video's:
   * a transcoded stream starts at whatever second it was generated from, so
   * the element's currentTime is an offset into the stream and its duration
   * is the remainder. Position and length therefore come from streamOffset
   * and the probed duration, and a seek is a new stream rather than a move
   * within this one.
   *
   * Deliberately plain. It stands in for the browser's own bar rather than
   * competing with it, and a file that plays directly never sees it.
   */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  /*
   * Our own transport, for the transcoded path only.
   *
   * Everything here exists because the element's timeline is not the video's:
   * a transcoded stream starts at whatever second it was generated from, so
   * the element's currentTime is an offset into the stream and its duration
   * is the remainder. Position and length therefore come from streamOffset
   * and the probed duration, and a seek is a new stream rather than a move
   * within this one.
   *
   * It carries volume, captions and fullscreen as well as the bar, because
   * switching the native controls off takes those away too - a replacement
   * that only replaces the scrubber leaves the player less usable than the
   * problem it was solving.
   */
  const playerControls = (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", paddingX: 1, paddingTop: 0.5 }}>
      <IconButton size="small" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay}>
        {playing ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>
      <Typography variant="caption" sx={{ fontFamily: monoFontFamily, whiteSpace: "nowrap" }}>
        {secondsToHHMMSS(positionSeconds)}
      </Typography>
      <Slider
        size="small"
        min={0}
        max={Math.max(1, Math.floor(info.durationSeconds ?? 0))}
        value={Math.min(positionSeconds, Math.floor(info.durationSeconds ?? 0))}
        // Committed rather than continuous: every change starts a new encode,
        // so reacting while the handle is dragged would spawn one per pixel
        // and cancel each in turn.
        // Milliseconds: seekTo is the same entry point chapter jumps use.
        onChangeCommitted={(_event, value) => seekTo((Array.isArray(value) ? value[0] : value) * 1000)}
        disabled={!info.durationSeconds}
        aria-label="Seek"
        sx={{ flexGrow: 1, marginX: 1 }}
      />
      <Typography variant="caption" sx={{ fontFamily: monoFontFamily, whiteSpace: "nowrap" }}>
        {info.durationSeconds ? secondsToHHMMSS(Math.floor(info.durationSeconds)) : "--:--"}
      </Typography>
      <IconButton
        size="small"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={() => {
          const video = videoRef.current;
          if (video) {
            video.muted = !video.muted;
            setMuted(video.muted);
          }
        }}
      >
        {muted ? <VolumeOffIcon fontSize="small" /> : <VolumeUpIcon fontSize="small" />}
      </IconButton>
      {info.subtitleTracks.length > 0 && (
        <IconButton
          size="small"
          aria-label="Subtitles"
          onClick={(event) => setCaptionsAnchor(event.currentTarget)}
        >
          <ClosedCaptionIcon fontSize="small" color={activeTrack >= 0 ? "primary" : "inherit"} />
        </IconButton>
      )}
      <Menu anchorEl={captionsAnchor} open={Boolean(captionsAnchor)} onClose={() => setCaptionsAnchor(null)}>
        {/*
          Driven straight at the element's text tracks, which is what the
          browser's own menu was doing before it was switched off.
        */}
        <MenuItem
          selected={activeTrack < 0}
          onClick={() => {
            const tracks = videoRef.current?.textTracks;
            if (tracks) {
              for (let index = 0; index < tracks.length; index++) {
                tracks[index].mode = "disabled";
              }
            }
            setActiveTrack(-1);
            setCaptionsAnchor(null);
          }}
        >
          Off
        </MenuItem>
        {info.subtitleTracks.map((track, index) => (
          <MenuItem
            key={`cc-${track.source}-${track.index}`}
            selected={activeTrack === index}
            onClick={() => {
              const tracks = videoRef.current?.textTracks;
              if (tracks) {
                for (let position = 0; position < tracks.length; position++) {
                  tracks[position].mode = position === index ? "showing" : "disabled";
                }
              }
              setActiveTrack(index);
              setCaptionsAnchor(null);
            }}
          >
            {track.label}
          </MenuItem>
        ))}
      </Menu>
      <IconButton
        size="small"
        aria-label="Fullscreen"
        onClick={() => {
          // The shell rather than the video, so our controls come with it -
          // fullscreening the element alone would show the picture and leave
          // the transport behind on the page.
          const shell = playerShellRef.current;
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          } else {
            void shell?.requestFullscreen().catch(() => {});
          }
        }}
      >
        <FullscreenIcon fontSize="small" />
      </IconButton>
      {/*
        A question with several parts, so a tooltip was the wrong shape for it.
        What the file is, what this browser will and will not decode, what is
        therefore being done to it, and what that costs - a viewer wondering
        why a video sounds wrong, plays oddly or will not skip properly is
        asking about whichever of those applies, and cannot know which.
      */}
      <Tooltip title="Playback details">
        <IconButton size="small" aria-label="Playback details" onClick={(event) => setDetailsAnchor(event.currentTarget)}>
          <InfoOutlinedIcon fontSize="small" color={transcoding ? "primary" : "inherit"} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(detailsAnchor)}
        anchorEl={detailsAnchor}
        onClose={() => setDetailsAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Stack spacing={1} sx={{ padding: 2, maxWidth: 380 }}>
          <Typography variant="subtitle2">
            {transcoding ? "Re-encoded for your browser" : "Playing the file directly"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {transcoding
              ? "Your browser cannot decode part of this file, so the app is converting it as you watch. The file itself is untouched and unchanged."
              : "Your browser can decode this file as it stands, so it is being sent straight from disk - nothing is being converted."}
          </Typography>
          <Divider />
          <DetailRow
            label="Video"
            value={`${info.videoCodec ?? "unknown"}${info.width && info.height ? ` · ${info.width}x${info.height}` : ""}`}
            note={videoSupported ? "played as-is" : "re-encoded - your browser cannot decode it"}
            warn={!videoSupported}
          />
          <DetailRow
            label="Audio"
            value={info.audioCodec ?? "unknown"}
            note={audioSupported ? "played as-is" : "re-encoded to AAC - no browser can decode this format"}
            warn={!audioSupported}
          />
          {transcoding && (
            <Fragment>
              <Divider />
              <Typography variant="caption" color="text.secondary">
                Skipping has to restart the conversion from the new point, so expect a short pause and a small rewind to
                the nearest keyframe. Video is copied rather than re-encoded wherever possible, which costs almost
                nothing; re-encoding the picture itself uses the processor, as the bundled ffmpeg has no graphics-card
                encoder.
              </Typography>
            </Fragment>
          )}
          <Typography variant="caption" color="text.disabled">
            This file plays with sound in Plex, Jellyfin or VLC regardless - the limitation is the browser's, not the
            download's.
          </Typography>
        </Stack>
      </Popover>
    </Stack>
  );

  /*
   * The shortcuts the browser's own controls used to provide.
   *
   * Switching those off took these with them, and losing space-to-pause is
   * the sort of regression that makes a player feel broken without anyone
   * being able to say why. Scoped to the player rather than the document:
   * a global space handler would fight every other control on the page.
   */
  const onPlayerKeyDown = (event: React.KeyboardEvent) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case " ":
      case "k":
        handled();
        togglePlay();
        return;
      case "ArrowLeft":
        handled();
        seekTo(Math.max(0, positionSeconds - 10) * 1000);
        return;
      case "ArrowRight":
        handled();
        seekTo((positionSeconds + 10) * 1000);
        return;
      case "m":
        handled();
        video.muted = !video.muted;
        setMuted(video.muted);
        return;
      case "f":
        handled();
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => {});
        } else {
          void playerShellRef.current?.requestFullscreen().catch(() => {});
        }
        return;
      default:
        return;
    }
  };

  const videoElement = (
    <Stack
      ref={playerShellRef}
      // Focusable so the shortcuts above have somewhere to land. Clicking the
      // picture focuses it, which is what a viewer does before reaching for
      // the space bar anyway.
      tabIndex={0}
      onKeyDown={onPlayerKeyDown}
      sx={{
        width: "100%",
        minWidth: 0,
        backgroundColor: "common.black",
        borderRadius: 1,
        "&:focus": { outline: "none" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
      }}
    >
      {/*
        The picture, with the two things the browser gave us for free and
        stops giving once its controls are off: click anywhere to pause, and
        something to press when it is paused.
      */}
      <Box
        onClick={togglePlay}
        /*
          A fixed shape, held whatever the video is doing.

          16:9 unless the file says otherwise - every video here is 16:9, and
          a default is needed anyway for the moment before the probe returns.
          Capped by maxHeight so a tall window does not hand the picture the
          whole screen.
        */
        sx={{
          position: "relative",
          width: "100%",
          minWidth: 0,
          aspectRatio: info.width && info.height ? `${info.width} / ${info.height}` : "16 / 9",
          maxHeight: maxHeight ?? "60vh",
          backgroundColor: "common.black",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {videoSurface}
        {!playing && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <PlayArrowIcon sx={{ fontSize: 64, color: "common.white", opacity: 0.85 }} />
          </Box>
        )}
      </Box>
      {playerControls}
    </Stack>
  );

  const errorBanner = playbackError && (
    <Alert
      severity="error"
      /*
        A way out, not just a description of the dead end.
        
        Once the element has errored its controls do nothing, so being told to
        wait and try again left no way to actually try again short of closing
        the whole thing and opening it afresh. Only offered on the transcoded
        path, where retrying is genuinely likely to work - an unsupported
        codec will still be unsupported a second later.
      */
      action={
        transcoding && (
          <Button
            color="inherit"
            size="small"
            onClick={() => {
              setPlaybackError(null);
              setRetryNonce((nonce) => nonce + 1);
              setPlaying(true);
            }}
          >
            Try again
          </Button>
        )
      }
    >
      <Typography variant="body2">{playbackError}</Typography>
      <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", wordBreak: "break-all", marginTop: 0.5 }}>
        {download.downloadLocation}
      </Typography>
    </Alert>
  );

  // Embedded text subtitles play now, so this is no longer "embedded means
  // no captions" - it is the remainder that genuinely cannot be shown:
  // picture-based streams, which would need OCR, and sidecars whose file has
  // gone missing.
  const embeddedNote = info.embeddedSubtitlesOnly && (
    <Typography variant="body2" color="text.disabled">
      This file's subtitles can't be displayed - they're either stored as images, which need to be read by eye rather
      than played as text, or the subtitle file has gone missing. Generating subtitles again produces an .srt that will
      play here.
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
            {videoElement}
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
        {videoElement}
        {belowVideo}
      </Box>
      {embeddedNote}
      {timeline}
    </Stack>
  );
};
