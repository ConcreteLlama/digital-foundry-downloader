import { fileSizeStringToBytes } from "../../utils/file-utils.js";
import { getMostImportantItem } from "../../utils/importance-list.js";
import { AudioProperties, getAudioProperties } from "./audio-properties.js";
import { mediaInfoMatches } from "./matcher.js";
import { audioEncodings, inferMediaEncoding, MediaEncoding, videoEncodings } from "./media-encoding.js";
import { getMediaFormatMatches, mediaFormatMatches } from "./media-format-matchers.js";
import { MediaFormat } from "./media-format.js";
import { MediaInfo, MediaType } from "./media-info.js";
import { RawMediaInfo } from "./raw-media-info.js";
import { getVideoProperties, VideoProperties } from "./video-properties.js";

const inferMediaType = ({ audioProperties, videoProperties, formatString: format, mediaFilename, mediaEncoding }: {
  audioProperties?: AudioProperties | null;
  videoProperties?: VideoProperties | null;
  mediaEncoding: MediaEncoding;
  formatString?: string | null;
  mediaFilename?: string | null;
}): MediaType => {
  const hasAudio = Boolean(audioProperties);
  const hasVideo = Boolean(videoProperties);
  if (hasAudio && hasVideo) {
    return "VIDEO";
  }
  if (hasAudio) {
    return "AUDIO";
  }
  if (videoEncodings.has(mediaEncoding)) {
    return "VIDEO";
  }
  if (audioEncodings.has(mediaEncoding)) {
    return "AUDIO";
  }
  if (mediaFilename?.endsWith(".mp3")) {
    return "AUDIO";
  }
  if (mediaFilename?.endsWith(".mp4") || mediaFilename?.endsWith(".mkv") || mediaFilename?.endsWith(".avi")) {
    return "VIDEO";
  }
  if (format === "ZIP" || format === "RAR" || mediaFilename?.endsWith(".zip") || mediaFilename?.endsWith(".rar")) {
    return "ARCHIVE";
  }
  return "UNKNOWN";
}




export const inferMediaInfo = (rawMediaInfo: RawMediaInfo): MediaInfo => {
    const { format: formatString, mediaFilename, videoProperties: videoPropertiesString, audioProperties: audioPropertiesString, size: rawSize } = rawMediaInfo;
    const encoding = inferMediaEncoding(rawMediaInfo);
    const audioProperties = getAudioProperties(audioPropertiesString);
    const videoProperties = getVideoProperties(videoPropertiesString);
    const type = inferMediaType({ audioProperties, videoProperties, formatString, mediaFilename, mediaEncoding: encoding });
    const size = rawSize ? (typeof rawSize === "string" ? fileSizeStringToBytes(rawSize) : rawSize) : undefined;
    return {
        duration: rawMediaInfo.duration || undefined,
        size,
        type,
        formatString,
        encoding,
        videoProperties,
        audioProperties,
        videoId: rawMediaInfo.videoId || undefined,
        mediaFilename : rawMediaInfo.mediaFilename || undefined,
    }

}


type MediaInfoMatchProps = {
  mustMatch?: boolean;
}

  export const getMatchingMediaFormat = (
    mediaFormatPriorityList: MediaFormat[],
    mediaInfo: MediaInfo
  ) => {
    for (const mediaFormat of mediaFormatPriorityList) {
      if (mediaFormatMatches(mediaFormat, mediaInfo)) {
        return mediaFormat;
      }
    }
    return null;
  };
  
  /**
   * Get the index of the media type in the priority list
   * @param mediaTypePriorityList The list of media types in order of priority
   * @param mediaType The media type to find the index of
   * @returns
   */
  export const getMediaFormatIndex = (mediaTypePriorityList: MediaFormat[], mediaInfo: MediaInfo) => {
    return mediaTypePriorityList.findIndex((priorityMediaFormat) => mediaFormatMatches(priorityMediaFormat, mediaInfo));
  };

  export const getBestMediaInfoMatch = (mediaFormatPriorityList: MediaFormat[], mediaInfoList: MediaInfo[], { mustMatch = true }: MediaInfoMatchProps = {}) =>
    getMostImportantItem(mediaFormatPriorityList, mediaInfoList, (mediaTypeList, mediaInfo) =>
      getMediaFormatIndex(mediaTypeList, mediaInfo), {
      mustMatch,
    });