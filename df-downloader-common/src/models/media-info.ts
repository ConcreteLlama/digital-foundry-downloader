import { z } from "zod";
import { stringToDuration } from "../utils/time-utils.js";

export const MediaInfo = z.object({
  duration: z.string().optional(),
  size: z.string().optional(),
  mediaType: z.string(),
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
    return mediaInfo.mediaType === "MP3" ? "mp3" : "mp4";
  },
};
