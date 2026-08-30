import { Box, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { DfContentEntry, DfContentInfoUtils } from "df-downloader-common";
import { useMemo, useState } from "react";
import { DownloadPlayer } from "../downloaded-info/download-player.component.tsx";
import { Thumb } from "../../general/thumb.component.tsx";
import { YouTubeEmbed } from "../../general/youtube-embed.tsx";

export type ContentMediaProps = {
  contentEntry: DfContentEntry;
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
export const ContentMedia = ({ contentEntry }: ContentMediaProps) => {
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

  // What you have on disk wins the default; YouTube only when there is
  // nothing downloaded.
  const [selected, setSelected] = useState<string>(() =>
    sourceKey(playable.length ? { kind: "download", index: 0 } : { kind: "youtube" })
  );
  const active = sources.find((source) => sourceKey(source) === selected) ?? sources[0];

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
            setSelected(next);
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

  if (active?.kind === "download") {
    return (
      <Box sx={{ minWidth: 0 }}>
        <DownloadPlayer
          contentEntry={contentEntry}
          download={playable[active.index]}
          // The content panel is not a player you deliberately opened - it is a
          // panel you opened to read about something, so it must not start
          // making noise on its own.
          autoPlay={false}
          maxHeight="52vh"
          // Under the video, above the chapters - next to what it changes.
          belowVideo={switcher}
        />
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
    </Box>
  );
};
