import { ImageList, ImageListItem, Paper, useMediaQuery, useTheme } from "@mui/material";
import { DfContentInfoUtils, PreviewThumbnailResponse, logger, parseResponseBody } from "df-downloader-common";
import { Thumb } from "./thumb.component";
import { Fragment, useEffect, useMemo, useState } from "react";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";

const getThumbs = (setThumbs: (thumbs: string[]) => void) => {
  logger.log("info", "getting thumbs");
  fetchJson(`${API_URL}/preview/thumbs`).then((data) => {
    const thumbResponse = parseResponseBody(data, PreviewThumbnailResponse);
    const thumbs = thumbResponse.data?.thumnails || [];
    thumbs.length > 0 && setThumbs(thumbs);
  });
};

/**
 * Which way a tile slides in from.
 *
 * The four directions and the 400-2000ms spread are what the collage did
 * before the redesign, when each tile was a mui-image with `shift` and
 * `shiftDuration` set at random. Swapping mui-image for a plain img dropped
 * both props and with them the effect - the grid went from assembling itself
 * to appearing all at once.
 */
const SHIFTS = ["Left", "Right", "Top", "Bottom"] as const;

const SHIFT_KEYFRAMES = {
  "@keyframes dfThumbInLeft": {
    from: { opacity: 0, transform: "translateX(-40px)" },
    to: { opacity: 1, transform: "none" },
  },
  "@keyframes dfThumbInRight": {
    from: { opacity: 0, transform: "translateX(40px)" },
    to: { opacity: 1, transform: "none" },
  },
  "@keyframes dfThumbInTop": {
    from: { opacity: 0, transform: "translateY(-40px)" },
    to: { opacity: 1, transform: "none" },
  },
  "@keyframes dfThumbInBottom": {
    from: { opacity: 0, transform: "translateY(40px)" },
    to: { opacity: 1, transform: "none" },
  },
};

type CollageBackgroundProps = {
  refresh?: number;
  cols: number;
};

const CollageBackground = ({ refresh, cols }: CollageBackgroundProps) => {
  const [thumbs, setThumbs] = useState<string[]>([]);
  useEffect(() => {
    getThumbs(setThumbs);
    let interval: ReturnType<typeof setInterval>;
    if (refresh) {
      interval = setInterval(() => {
        getThumbs(setThumbs);
      }, refresh);
    }
    return () => {
      interval && clearInterval(interval);
    };
  }, [refresh]);

  /*
   * Rolled once per set of thumbnails rather than per render.
   *
   * Picking at render time would re-roll on every state change and restart
   * every tile's animation, which is how a background stops being scenery and
   * starts being a distraction.
   */
  const entrances = useMemo(
    () =>
      thumbs.map(() => ({
        shift: SHIFTS[Math.floor(Math.random() * SHIFTS.length)],
        duration: Math.floor(Math.random() * 1600) + 400,
      })),
    [thumbs]
  );

  return (
    <ImageList
      sx={{
        /*
         * Twenty past the top, so the first row is cropped rather than
         * sitting flush - and correspondingly taller, or the same nudge left
         * a 20px strip of empty page along the bottom.
         */
        height: "calc(100vh + 20px)",
        width: "100%",
        top: -20,
        position: "absolute",
        overflow: "hidden",
        margin: 0,
        ...SHIFT_KEYFRAMES,
      }}
      cols={cols}
    >
      {thumbs.map((thumb, index) => {
        const { shift, duration } = entrances[index] ?? { shift: "Left", duration: 800 };
        return (
          <ImageListItem
            key={`bg-thumb-${thumb}`}
            sx={{
              animation: `dfThumbIn${shift} ${duration}ms ease-out both`,
              // Scenery should not fight anyone who has asked the system to
              // stop moving things about.
              "@media (prefers-reduced-motion: reduce)": { animation: "none" },
            }}
          >
            {/*
              * Fills its tile instead of holding 16:9.
              *
              * ImageList stretches its rows to fill the height it is given,
              * so a tile is as tall as the viewport divided by the number of
              * rows - nothing to do with the shape of a thumbnail. A fixed
              * ratio inside that left a dead band under every image, which on
              * a tall or near-square screen reads as letterboxing across the
              * whole collage. Cropping is the right answer for scenery.
              */}
            <Thumb
              src={DfContentInfoUtils.thumbnailUrlToSize(thumb, 200)}
              width="100%"
              aspectRatio="auto"
              sx={{ height: "100%" }}
            />
          </ImageListItem>
        );
      })}
    </ImageList>
  );
};

export type ThumbnailBackgroundPageProps = {
  children?: React.ReactNode;
};

/**
 * The login page's backdrop: a collage of thumbnails from the library.
 *
 * The same collage at every width, with fewer columns on a narrow screen.
 * A phone used to get a single thumbnail instead, which drew one 16:9 image
 * across the top and left the rest of the page empty - it read as a broken
 * header rather than as a background.
 */
export const ThumbnailBackgroundPage = ({ children }: ThumbnailBackgroundPageProps) => {
  const theme = useTheme();
  const isWide = useMediaQuery(theme.breakpoints.up("md"));
  const isMedium = useMediaQuery(theme.breakpoints.up("sm"));
  return (
    <Paper sx={{ width: "100vw", height: "100vh", overflow: "hidden" }} id="thumbnail-background-page">
      <CollageBackground cols={isWide ? 4 : isMedium ? 3 : 2} />
      <Fragment>{children}</Fragment>
    </Paper>
  );
};
