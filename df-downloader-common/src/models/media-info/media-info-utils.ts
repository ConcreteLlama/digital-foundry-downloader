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
 * Extract filename from URL, handling query parameters
 */
const extractFilenameFromUrl = (url: string): string | null => {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const filename = pathname.substring(pathname.lastIndexOf('/') + 1);
    // Decode URL encoding (e.g., %20 -> space)
    return filename ? decodeURIComponent(filename) : null;
  } catch {
    // If URL parsing fails, try simple extraction
    const match = url.match(/\/([^/?]+)(?:\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
};

/**
 * Create MediaInfo from a format string and URL, commonly used for manual/external imports
 * This handles format strings like "h.264 1080p", "HEVC 4K", "MP3", etc.
 */
export const createMediaInfoFromFormatString = (formatString: string, url: string): MediaInfo => {
  // Extract video properties from the format string if possible
  const videoPropertiesString = extractVideoPropertiesFromFormat(formatString);

  // Extract filename from URL
  const mediaFilename = extractFilenameFromUrl(url);

  // Create RawMediaInfo to feed into the inference system
  const rawMediaInfo: RawMediaInfo = {
    format: formatString,
    videoProperties: videoPropertiesString,
    audioProperties: null,
    duration: null,
    size: null,
    videoId: null,
    mediaFilename
  };

  // Use the proper media info inference
  const inferredMediaInfo = inferMediaInfo(rawMediaInfo);

  // Store the URL in the downloadUrl field
  return {
    ...inferredMediaInfo,
    downloadUrl: url
  };
};

const NEW_SITE_RESOLUTION_LABELS: Record<string, string> = {
  "8k": "7680x4320",
  "4k": "3840x2160",
  "1440p": "2560x1440",
  "1080p": "1920x1080",
  "720p": "1280x720",
};

/**
 * digitalfoundry.net (post-relaunch) resolution labels are either a known
 * abbreviation ("4K", "1080p") or an explicit "WIDTHxHEIGHT" (e.g. "3840x1600"
 * for ultrawide captures).
 */
const parseNewSiteResolution = (label: string): string | null => {
  const trimmed = label.trim();
  const explicit = trimmed.match(/^(\d+)x(\d+)$/i);
  if (explicit) {
    return `${explicit[1]}x${explicit[2]}`;
  }
  return NEW_SITE_RESOLUTION_LABELS[trimmed.toLowerCase()] || null;
};

/**
 * Create MediaInfo from digitalfoundry.net's post-relaunch `/videos` listing
 * (and its backing `/api/1.0/listing` JSON endpoint), where each download link
 * carries a format label like "4K (H.264)", "MP3", or "3840x1600 (HEVC)" and a
 * separate metadata string like "2.82 GB / 60fps / 35.31mbps" or
 * "185.31 MB / 2.0ch / 256kbps / 48000Hz". `downloadPath` is the relative
 * `videos/download/<id>` href from the page.
 */
export const createMediaInfoFromNewSiteListing = (formatLabel: string, metaText: string, downloadPath: string): MediaInfo => {
  const trimmedLabel = formatLabel.trim();
  const parenMatch = trimmedLabel.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  const resolutionLabel = parenMatch ? parenMatch[1] : trimmedLabel;
  const resolution = parseNewSiteResolution(resolutionLabel);

  const metaParts = metaText.split("/").map((part) => part.trim()).filter(Boolean);
  const [sizeStr, ...rest] = metaParts;

  let videoPropertiesString: string | null = null;
  let audioPropertiesString: string | null = null;

  if (resolution) {
    const fpsMatch = rest[0]?.match(/([\d.]+)fps/i);
    const bitrateMatch = rest.find((part) => /mbps/i.test(part))?.match(/([\d.]+)mbps/i);
    const parts = [resolution];
    if (fpsMatch) parts.push(`${fpsMatch[1]}fps`);
    if (bitrateMatch) parts.push(`${bitrateMatch[1]}mbps`);
    videoPropertiesString = parts.join(", ");
  } else {
    const channelsMatch = rest[0]?.match(/([\d.]+)ch/i);
    const bitrateMatch = rest.find((part) => /kbps?/i.test(part))?.match(/([\d.]+)kbp?s/i);
    const sampleRateMatch = rest.find((part) => /hz/i.test(part))?.match(/([\d.]+)hz/i);
    const encodingLabel = /mp3/i.test(trimmedLabel) ? "MP3" : trimmedLabel.toUpperCase();
    const parts = [`${encodingLabel} ${channelsMatch ? channelsMatch[1] : "0"}`];
    if (bitrateMatch) parts.push(`${bitrateMatch[1]}kbps`);
    if (sampleRateMatch) parts.push(`${sampleRateMatch[1]}Hz`);
    audioPropertiesString = parts.join(", ");
  }

  const rawMediaInfo: RawMediaInfo = {
    format: trimmedLabel,
    videoProperties: videoPropertiesString,
    audioProperties: audioPropertiesString,
    duration: null,
    size: sizeStr || null,
    videoId: null,
    mediaFilename: null,
  };

  const mediaInfo = inferMediaInfo(rawMediaInfo);
  return {
    ...mediaInfo,
    downloadUrl: `https://www.digitalfoundry.net/${downloadPath.replace(/^\//, "")}`,
  };
};