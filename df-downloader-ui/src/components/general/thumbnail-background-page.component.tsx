import { ImageList, ImageListItem, Paper, useMediaQuery } from "@mui/material";
import { DfContentInfoUtils, PreviewThumbnailResponse, logger, parseResponseBody } from "df-downloader-common";
import Image from "mui-image";
import { Fragment, useEffect, useState } from "react";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";
import { theme } from "../../themes/theme";

const getThumbs = (setThumbs: (thumbs: string[]) => void) => {
  logger.log("info", "getting thumbs");
  fetchJson(`${API_URL}/preview/thumbs`).then((data) => {
    const thumbResponse = parseResponseBody(data, PreviewThumbnailResponse);
    const thumbs = thumbResponse.data?.thumnails || [];
    thumbs.length > 0 && setThumbs(thumbs);
  });
};

type BigImageBackgroundProps = {
  refresh?: number;
};
const BigImageBackground = ({ refresh }: BigImageBackgroundProps) => {
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  const setRandomThumb = (thumbs: string[]) => {
    const idx = Math.floor(Math.random() * thumbs.length);
    thumbs[idx] && setThumb(thumbs[idx]);
  };
  useEffect(() => {
    getThumbs(setThumbs);
  }, [refresh]);
  useEffect(() => {
    setRandomThumb(thumbs);
    let interval: ReturnType<typeof setInterval>;
    if (refresh) {
      interval = setInterval(() => {
        setRandomThumb(thumbs);
      }, refresh);
    }
    return () => {
      interval && clearInterval(interval);
    };
  }, [thumbs, refresh]);
  return <Fragment>{thumb && <Image src={thumb} />}</Fragment>;
};

type CollageBackgroundProps = {
  refresh?: number;
};
const CollageBackground = ({ refresh }: CollageBackgroundProps) => {
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
  const shiftOpts: ("left" | "right" | "bottom" | "top")[] = ["left", "right", "bottom", "top"];
  return (
    <Fragment>
      <ImageList sx={{ height: "100vh", top: -20, position: "absolute" }} cols={4}>
        {thumbs.map((thumb) => (
          <ImageListItem key={`bg-thumb-${thumb}`}>
            <Image
              src={DfContentInfoUtils.thumbnailUrlToSize(thumb, 200)}
              shift={shiftOpts[Math.floor(Math.random() * shiftOpts.length)]}
              shiftDuration={Math.floor(Math.random() * 1600) + 400}
            />
          </ImageListItem>
        ))}
      </ImageList>
    </Fragment>
  );
};

export type ThumbnailBackgroundPageProps = {
  children?: React.ReactNode;
};
export const ThumbnailBackgroundPage = ({ children }: ThumbnailBackgroundPageProps) => {
  const useGallery = useMediaQuery(theme.breakpoints.up("md"));
  return (
    <Paper sx={{ width: "100vw", height: "100vh" }}>
      {useGallery ? <CollageBackground /> : <BigImageBackground refresh={10000} />}
      {children}
    </Paper>
  );
};
