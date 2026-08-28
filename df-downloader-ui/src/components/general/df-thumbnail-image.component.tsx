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
  const src =
    hqDefaultFallback && canFallBackToYoutube
      ? DfContentInfoUtils.getYoutubeThumbnailUrl(contentInfo.youtubeVideoId!, "hqdefault")
      : DfContentInfoUtils.getThumbnailUrl(contentInfo, width, height);
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
