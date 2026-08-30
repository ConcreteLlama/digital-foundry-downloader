import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { Chapter, DfContentEntry, DfContentInfoUtils, PlaybackInfo, secondsToHHMMSS } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisJump } from "../ai-analysis/analysis-jumps.ts";
import { rememberPlaybackPosition, rememberedPlaybackPosition } from "./playback-positions.ts";
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
      // An explicitly requested moment wins: someone clicked a timestamp.
      if (startSeconds != null) {
        video.currentTime = startSeconds;
        return;
      }
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
        maxHeight: maxHeight ?? "60vh",
        minHeight: 0,
        backgroundColor: "common.black",
        borderRadius: 1,
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
