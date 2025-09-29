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

/**
 * Extract video properties string from format string for common patterns
 * like "h.264 1080p", "HEVC 4K", "4k120", "1080p60", etc.
 */
const extractVideoPropertiesFromFormat = (formatString: string): string | null => {
  const formatLower = formatString.toLowerCase();

  let resolution: string | null = null;
  let framerate: number | null = null;

  // Check for combined resolution+framerate patterns first (e.g., "4k120", "1080p60")
  const combinedPatterns = [
    { regex: /\b4k(\d+)\b/i, resolution: '3840x2160' },           // "4k120" -> 4K 120fps
    { regex: /\b8k(\d+)\b/i, resolution: '7680x4320' },          // "8k60" -> 8K 60fps
    { regex: /\b1080p?(\d+)\b/i, resolution: '1920x1080' },      // "1080p60" -> 1080p 60fps
    { regex: /\b720p?(\d+)\b/i, resolution: '1280x720' },        // "720p30" -> 720p 30fps
    { regex: /\b1440p?(\d+)\b/i, resolution: '2560x1440' },      // "1440p120" -> 1440p 120fps
  ];

  for (const pattern of combinedPatterns) {
    const match = formatString.match(pattern.regex);
    if (match) {
      resolution = pattern.resolution;
      framerate = parseInt(match[1]);
      break;
    }
  }

  // If no combined pattern found, check for separate resolution patterns
  if (!resolution) {
    if (formatLower.includes('4k')) {
      resolution = '3840x2160';
    } else if (formatLower.includes('8k')) {
      resolution = '7680x4320';
    } else if (formatLower.includes('1080p') || formatLower.includes('1080')) {
      resolution = '1920x1080';
    } else if (formatLower.includes('720p') || formatLower.includes('720')) {
      resolution = '1280x720';
    } else if (formatLower.includes('1440p') || formatLower.includes('1440')) {
      resolution = '2560x1440';
    }

    // Check for explicit WxH pattern
    const explicitMatch = formatString.match(/\b(\d+)x(\d+)\b/i);
    if (explicitMatch) {
      resolution = `${explicitMatch[1]}x${explicitMatch[2]}`;
    }
  }

  // If no framerate found yet, check for standalone fps patterns
  if (framerate === null) {
    const fpsMatch = formatString.match(/\b(\d+)fps\b/i);
    if (fpsMatch) {
      framerate = parseInt(fpsMatch[1]);
    }
  }

  // Build the properties string in the format that getVideoProperties expects
  if (resolution && framerate) {
    return `${resolution}, ${framerate}fps`;
  } else if (resolution) {
    return resolution;
  } else if (framerate) {
    // Framerate without resolution - not very useful but we'll include it
    return `${framerate}fps`;
  }

  return null;
};

/**
 * Create MediaInfo from a format string and URL, commonly used for manual/external imports
 * This handles format strings like "h.264 1080p", "HEVC 4K", "MP3", etc.
 */
export const createMediaInfoFromFormatString = (formatString: string, url: string): MediaInfo => {
  // Extract video properties from the format string if possible
  const videoPropertiesString = extractVideoPropertiesFromFormat(formatString);

  // Create RawMediaInfo to feed into the inference system
  const rawMediaInfo: RawMediaInfo = {
    format: formatString,
    videoProperties: videoPropertiesString,
    audioProperties: null,
    duration: null,
    size: null,
    videoId: null,
    mediaFilename: null
  };

  // Use the proper media info inference
  const inferredMediaInfo = inferMediaInfo(rawMediaInfo);

  // Store the URL in the duration field temporarily for API extraction
  return {
    ...inferredMediaInfo,
    duration: url // Store URL here for API extraction
  };
};