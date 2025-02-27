import { z } from "zod";
import { stringToDuration } from "../utils/time-utils.js";
import { MediaFormat } from "./media-format.js";
import { getMostImportantItem } from "../utils/importance-list.js";
import { getMediaFormatIndex } from "../utils/media-format-utils.js";

export const MediaType = z.enum(["VIDEO", "AUDIO", "ARCHIVE", "UNKNOWN"]);
export type MediaType = z.infer<typeof MediaType>;

export const MediaInfo = z.object({
  duration: z.string().optional(),
  size: z.string().optional(),
  type: MediaType,
  format: z.string(),
  videoEncoding: z.string().optional(),
  audioEncoding: z.string().optional(),
  videoId: z.string().optional(),
  mediaFilename: z.string().optional(),
});
export type MediaInfo = z.infer<typeof MediaInfo>;

export const MediaInfoUtils = {
  getDurationSeconds(mediaInfoList: MediaInfo[]) {
    for (const mediaInfo of mediaInfoList) {
      if (mediaInfo.duration) {
        try {
          const toReturn = stringToDuration(mediaInfo.duration);
          return toReturn;
        } catch (e) { }
      }
    }
    return 0;
  },
  getExtension(mediaInfo: MediaInfo) {
    if (mediaInfo.mediaFilename) {
      return mediaInfo.mediaFilename.split(".").pop() || "mp4";
    }
    return mediaInfo.format === "MP3" ? "mp3" : "mp4";
  },
};

type MediaInfoMatchProps = {
  mustMatch?: boolean;
}
export const getBestMediaInfoMatch = (mediaFormatPriorityList: MediaFormat[], mediaInfoList: MediaInfo[], { mustMatch = true }: MediaInfoMatchProps = {}) =>
  getMostImportantItem(mediaFormatPriorityList, mediaInfoList, (mediaTypeList, mediaInfo) =>
    getMediaFormatIndex(mediaTypeList, mediaInfo), {
    mustMatch,
  });