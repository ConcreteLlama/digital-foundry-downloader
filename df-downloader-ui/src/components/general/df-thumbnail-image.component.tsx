import { Image } from "mui-image";
import { DfContentInfo, DfContentInfoUtils } from "df-downloader-common";
import { useState } from "react";

export type DfThumbnailImageProps = {
  contentInfo: DfContentInfo;
  width: number;
  height?: number;
  [key: string]: unknown;
};

/**
 * Wraps mui-image's <Image> with the YouTube-thumbnail-fallback dance:
 * getThumbnailUrl() already falls back to YouTube's maxresdefault when DF's
 * own thumbnailUrl is missing (see df-content-info.ts), but maxresdefault
 * 404s for older/lower-res uploads - this retries once with hqdefault
 * (reliably exists for virtually every video) when that happens, rather
 * than showing mui-image's broken-image icon.
 */
export const DfThumbnailImage = ({ contentInfo, width, height, ...imageProps }: DfThumbnailImageProps) => {
  const [hqDefaultFallback, setHqDefaultFallback] = useState(false);
  const canFallBackToYoutube = !contentInfo.thumbnailUrl && Boolean(contentInfo.youtubeVideoId);
  const src =
    hqDefaultFallback && canFallBackToYoutube
      ? DfContentInfoUtils.getYoutubeThumbnailUrl(contentInfo.youtubeVideoId!, "hqdefault")
      : DfContentInfoUtils.getThumbnailUrl(contentInfo, width, height);
  return (
    <Image
      src={src}
      onError={() => {
        if (canFallBackToYoutube && !hqDefaultFallback) {
          setHqDefaultFallback(true);
        }
      }}
      {...imageProps}
    />
  );
};
