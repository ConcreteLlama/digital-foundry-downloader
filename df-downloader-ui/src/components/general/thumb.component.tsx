import { Box, SxProps } from "@mui/material";
import { useEffect, useState } from "react";

export type ThumbProps = {
  src: string;
  alt?: string;
  /** Width the image is actually drawn at, in CSS px. Also sizes the request. */
  width: number | string;
  /** Defaults to 16:9, which every DF thumbnail is. */
  aspectRatio?: string;
  /** Rendered in place of the image if it fails and there is no fallback left. */
  onError?: () => void;
  sx?: SxProps;
};

/**
 * A plain <img> in an aspect-ratio box.
 *
 * Replaces mui-image, which has been unpublished since 2022 and sat on the hot
 * path for every row in the library. It rendered its own fade-in wrapper and
 * shimmer per image, which is a lot of machinery for a thumbnail grid; the
 * fade here is one CSS transition on the img itself. The aspect-ratio box
 * reserves space before the image loads, so rows don't jump as they stream in.
 */
export const Thumb = ({ src, alt = "", width, aspectRatio = "16 / 9", onError, sx = {} }: ThumbProps) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // A new src (the hqdefault retry, or the row being recycled onto different
  // content) has to clear both flags or the old image's state sticks.
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <Box
      sx={{
        width,
        aspectRatio,
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: 1,
        backgroundColor: "background.default",
        position: "relative",
        ...sx,
      }}
    >
      {!failed && src && (
        <Box
          component="img"
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            opacity: loaded ? 1 : 0,
            transition: "opacity 200ms ease",
          }}
        />
      )}
    </Box>
  );
};
