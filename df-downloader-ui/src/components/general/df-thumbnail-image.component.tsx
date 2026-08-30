import { SxProps } from "@mui/material";
import { DfContentInfo, DfContentInfoUtils } from "df-downloader-common";
import { useState } from "react";
import { Thumb } from "./thumb.component";

export type DfThumbnailImageProps = {
  contentInfo: DfContentInfo;
  /**
   * The width the thumbnail is actually drawn at. DF's own thumbnail host
   * resizes from this, so passing the rendered size rather than a fixed large
   * one is the difference between a phone fetching a 96px image and a 450px
   * one it then scales down.
   */
  width: number;
  height?: number;
  /** CSS width for the box, when it differs from the requested pixel width. */
  displayWidth?: number | string;
  aspectRatio?: string;
  alt?: string;
  sx?: SxProps;
};

/**
 * The YouTube-thumbnail-fallback dance: getThumbnailUrl() already falls back
 * to YouTube's maxresdefault when DF's own thumbnailUrl is missing (see
 * df-content-info.ts), but maxresdefault 404s for older/lower-res uploads -
 * this retries once with hqdefault (reliably exists for virtually every video)
 * when that happens, rather than leaving an empty box.
 */
export const DfThumbnailImage = ({
  contentInfo,
  width,
  height,
  displayWidth,
  aspectRatio,
  alt,
  sx,
}: DfThumbnailImageProps) => {
  const [hqDefaultFallback, setHqDefaultFallback] = useState(false);
  const canFallBackToYoutube = !contentInfo.thumbnailUrl && Boolean(contentInfo.youtubeVideoId);
  /*
    Asks for the size the screen will actually draw, not the CSS size.

    `width` is the width in CSS pixels, which on a phone is a third of the
    real ones - so requesting it verbatim fetches an image a third of the
    resolution the display can show, and it looks soft. This was hidden until
    now: the resize was a no-op against DF's current URLs, so every caller
    silently received the scraped 300x169 original, which for a 96px row on a
    3x screen happened to be about right. Honouring the request without
    accounting for density would have made these *worse* than the bug did.

    Capped at 3, beyond which the extra pixels cost bandwidth for a
    difference nobody can see.
  */
  const density = typeof window === "undefined" ? 1 : Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
  const requestedWidth = Math.round(width * density);
  const requestedHeight = height ? Math.round(height * density) : undefined;
  const src =
    hqDefaultFallback && canFallBackToYoutube
      ? DfContentInfoUtils.getYoutubeThumbnailUrl(contentInfo.youtubeVideoId!, "hqdefault")
      : DfContentInfoUtils.getThumbnailUrl(contentInfo, requestedWidth, requestedHeight);
  return (
    <Thumb
      src={src}
      alt={alt ?? contentInfo.title}
      width={displayWidth ?? width}
      aspectRatio={aspectRatio}
      onError={() => {
        if (canFallBackToYoutube && !hqDefaultFallback) {
          setHqDefaultFallback(true);
        }
      }}
      sx={sx}
    />
  );
};
