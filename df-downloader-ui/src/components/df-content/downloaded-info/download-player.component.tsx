import { Alert, Box, CircularProgress, Stack, Typography } from "@mui/material";
import { Chapter, DfContentEntry, DfContentInfoUtils, PlaybackInfo, secondsToHHMMSS } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { useEffect, useMemo, useRef, useState } from "react";
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
   * Extra content for the theater rail, under the chapters.
   *
   * This is the seam for the AI-analysis timestamp linkage (roadmap item 10's
   * follow-up): the rail is where a list of claims-with-timestamps would go,
   * beside the video rather than under it. Nothing here needs to change to
   * add that - it needs `onSeek` wiring, which is already how the chapter
   * list drives the video.
   */
  sidePanel?: React.ReactNode;
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

const chapterIndexAt = (chapters: Chapter[], timeMs: number) =>
  chapters.findIndex((chapter) => timeMs >= chapter.start && timeMs < chapter.end);

const ChapterList = ({
  chapters,
  activeIndex,
  onSeek,
  maxHeight,
}: {
  chapters: Chapter[];
  activeIndex: number;
  onSeek: (startMs: number) => void;
  maxHeight: number | string;
}) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="overline" sx={{ color: "text.disabled" }}>
      {`Chapters · ${chapters.length}`}
    </Typography>
    <Stack sx={{ maxHeight, overflowY: "auto", marginTop: 0.5 }}>
      {chapters.map((chapter, index) => (
        <Box
          key={`chapter-${chapter.start}`}
          role="button"
          tabIndex={0}
          onClick={() => onSeek(chapter.start)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSeek(chapter.start);
            }
          }}
          sx={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            columnGap: 1.5,
            alignItems: "baseline",
            paddingY: 0.75,
            paddingX: 1,
            borderRadius: 1,
            cursor: "pointer",
            backgroundColor: index === activeIndex ? "action.selected" : undefined,
            "&:hover": { backgroundColor: "action.hover" },
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
          }}
        >
          <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.6875rem", color: "text.secondary" }}>
            {secondsToHHMMSS(Math.floor(chapter.start / 1000))}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: index === activeIndex ? 600 : 400 }}>
            {chapter.title}
          </Typography>
        </Box>
      ))}
    </Stack>
  </Box>
);

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
  sidePanel,
}: DownloadPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeChapter, setActiveChapter] = useState(-1);
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
    setActiveChapter(-1);
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

  // Tracking which chapter is playing means a timeupdate listener, which
  // fires several times a second - so state only changes when the chapter
  // itself does, not on every tick.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !info?.chapters.length) {
      return;
    }
    const onTimeUpdate = () => {
      const next = chapterIndexAt(info.chapters, video.currentTime * 1000);
      setActiveChapter((current) => (current === next ? current : next));
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [info, supported, layout]);

  const seekTo = (startMs: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = startMs / 1000;
    void video.play().catch(() => {
      // Autoplay policy can refuse this if nothing has been played yet. The
      // seek still happened, so the user can press play themselves.
    });
  };

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
          <Box sx={{ minWidth: 0, flex: "1 1 auto", display: "flex", flexDirection: "column" }}>
            {videoElement}
            {belowVideo}
            {embeddedNote}
          </Box>
          {(info.chapters.length > 0 || sidePanel) && (
            <Box
              sx={{
                width: { xs: "100%", md: 320 },
                flexShrink: 0,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              <Stack spacing={2}>
                {info.chapters.length > 0 && (
                  <ChapterList
                    chapters={info.chapters}
                    activeIndex={activeChapter}
                    onSeek={seekTo}
                    // Fills the rail rather than a fixed crop, so a video with
                    // 30 chapters uses the height the theater window has.
                    maxHeight="none"
                  />
                )}
                {sidePanel}
              </Stack>
            </Box>
          )}
        </Box>
      </Stack>
    );
  }

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      {errorBanner}
      {videoElement}
      {belowVideo}
      {embeddedNote}
      {info.chapters.length > 0 && (
        <ChapterList chapters={info.chapters} activeIndex={activeChapter} onSeek={seekTo} maxHeight={220} />
      )}
      {sidePanel}
    </Stack>
  );
};
