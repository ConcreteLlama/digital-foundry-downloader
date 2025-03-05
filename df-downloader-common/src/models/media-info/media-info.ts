import { z } from "zod";
import { stringToDuration } from "../../utils/time-utils.js";
import { MediaFormat } from "./media-format.js";
import { getMostImportantItem } from "../../utils/importance-list.js";
import { MediaEncoding } from "./media-encoding.js";
import { VideoProperties } from "./video-properties.js";
import { AudioProperties } from "./audio-properties.js";

export const MediaType = z.enum(["VIDEO", "AUDIO", "ARCHIVE", "UNKNOWN"]);
export type MediaType = z.infer<typeof MediaType>;

export const MediaInfo = z.object({
  duration: z.string().optional(),
  size: z.number().optional(),
  type: MediaType,
  formatString: z.string(),
  encoding: MediaEncoding,
  videoProperties: VideoProperties.nullable(),
  audioProperties: AudioProperties.nullable(),
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
    return mediaInfo.formatString === "MP3" ? "mp3" : "mp4";
  },
};