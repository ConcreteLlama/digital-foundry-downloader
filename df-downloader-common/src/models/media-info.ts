import { z } from "zod";
import { stringToDuration } from "../utils/time-utils.js";
import { isAudioFormat, isVideoFormat } from "./media-format.js";

export const MediaType = z.enum(["VIDEO", "AUDIO", "ARCHIVE", "OTHER"]);
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

type RawMediaInfo = {
  videoEncoding?: string;
  audioEncoding?: string;
  mediaFormat: string;
  mediaFilename?: string;
}
export const inferMediaType = ({ audioEncoding, videoEncoding, mediaFormat, mediaFilename}: RawMediaInfo): MediaType => {
  const hasAudio = audioEncoding && audioEncoding !== "-";
  const hasVideo = videoEncoding && videoEncoding !== "-";
  if (hasAudio && hasVideo) {
    return "VIDEO";
  }
  if (hasAudio) {
    return "AUDIO";
  }
  if (isVideoFormat(mediaFormat)) {
    return "VIDEO";
  }
  if (isAudioFormat(mediaFormat)) {
    return "AUDIO";
  }
  if (mediaFilename?.endsWith(".mp3")) {
    return "AUDIO";
  }
  if (mediaFilename?.endsWith(".mp4") || mediaFilename?.endsWith(".mkv") || mediaFilename?.endsWith(".avi")) {
    return "VIDEO";
  }
  if (mediaFormat === "ZIP" || mediaFormat === "RAR" || mediaFilename?.endsWith(".zip") || mediaFilename?.endsWith(".rar")) {
    return "ARCHIVE";
  }
  return "OTHER";
}

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
