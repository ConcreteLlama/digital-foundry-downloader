import { audioFormats, MediaFormat, videoFormats } from "../models/media-format.js";
import { MediaInfo, MediaType } from "../models/media-info.js";

const mediaFormatToRegexMap: Partial<Record<MediaFormat, RegExp>> = {
  HEVC: /HEVC/i,
  "h.264 (4K)": /h\.?264.*(4K|2160p).*/i,
  "h.264 (1080p)": /h\.?264.*(1080p).*/i,
  "h.264": /h\.?264/i,
  MP3: /mp3/i,
};

export const mediaFormatMatches = (mediaFormat: MediaFormat, mediaInfo: MediaInfo) => {
    if (mediaFormat === "Video (Unknown)") {
        return mediaInfo.type === "VIDEO";
    } else if (mediaFormat === "Audio (Unknown)") {
        return mediaInfo.type === "AUDIO";
    } else if (mediaFormat === "Unknown") {
        return mediaInfo.type === "UNKNOWN";
    } else {
        return mediaFormatToRegexMap[mediaFormat]?.test(mediaInfo.format) || false;
    }
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
  
  export const isAudioFormat = (mediaFormat: string | MediaFormat) => audioFormats.has(getMediaFormat(mediaFormat)!);
  export const isVideoFormat = (mediaFormat: string | MediaFormat) => videoFormats.has(getMediaFormat(mediaFormat)!);
  
  export const getMediaFormat = (mediaTypeString: string) => {
    for (const [mediaType, mediaTypeRegex] of Object.entries(mediaFormatToRegexMap) as [MediaFormat, RegExp][]) {
      if (mediaTypeRegex.test(mediaTypeString)) {
        return mediaType;
      }
    }
    return null;
  };

  export type RawMediaInfo = {
    videoEncoding?: string;
    audioEncoding?: string;
    mediaFormat: string;
    mediaFilename?: string;
  }

export const inferMediaTypeAndFormat = ({ audioEncoding, videoEncoding, mediaFormat, mediaFilename}: RawMediaInfo) => {
    const inferredType = inferMediaType({ audioEncoding, videoEncoding, mediaFormat, mediaFilename });
    const inferredFormat = inferMediaFormat({ audioEncoding, videoEncoding, mediaFormat, mediaFilename }, inferredType);
    return { mediaType: inferredType, mediaFormat: inferredFormat };
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
    return "UNKNOWN";
  }
  
export const inferMediaFormat = ({ audioEncoding, videoEncoding, mediaFormat, mediaFilename}: RawMediaInfo, typeHint?: MediaType): MediaFormat => {
    const matchedMediaFormat = getMediaFormat(mediaFormat);
    if (matchedMediaFormat) {
      return matchedMediaFormat;
    }
    const mediaType = typeHint ? typeHint : inferMediaType({ audioEncoding, videoEncoding, mediaFormat, mediaFilename });
    switch (mediaType) {
        case "VIDEO":
            return "Video (Unknown)";
        case "AUDIO":
            return "Audio (Unknown)";
        case "ARCHIVE":
        case "UNKNOWN":
            return "Unknown";
        }
    };