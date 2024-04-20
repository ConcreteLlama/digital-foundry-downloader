import { MediaType } from "../config/df-config.js";

export const mediaTypeToRegexMap: Record<MediaType, RegExp> = {
  HEVC: /HEVC/i,
  "h.264 (4K)": /h\.?264.*(4K|2160p).*/i,
  "h.264 (1080p)": /h\.?264.*(1080p).*/i,
  "h.264": /h\.?264/i,
  MP3: /mp3/i,
};

const audioFormats = new Set<MediaType>(["MP3"]);
const videoFormats = new Set<MediaType>(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264"]);

export const isAudioFormat = (mediaType: string | MediaType) => audioFormats.has(getMediaType(mediaType)!);
export const isVideoFormat = (mediaType: string | MediaType) => videoFormats.has(getMediaType(mediaType)!);

export const getMediaType = (mediaTypeString: string) => {
  for (const [mediaType, mediaTypeRegex] of Object.entries(mediaTypeToRegexMap) as [MediaType, RegExp][]) {
    if (mediaTypeRegex.test(mediaTypeString)) {
      return mediaType;
    }
  }
  return null;
};

export const getMatchingMediaType = (
  mediaTypePriorityList: MediaType[],
  mediaTypeString: string,
  mustMatch: boolean = false
) => {
  for (const mediaType of mediaTypePriorityList) {
    if (mediaTypeToRegexMap[mediaType].test(mediaTypeString)) {
      return mediaType;
    }
  }
  return mustMatch ? undefined : mediaTypeString;
};

/**
 * Get the index of the media type in the priority list
 * @param mediaTypePriorityList The list of media types in order of priority
 * @param mediaType The media type to find the index of
 * @returns
 */
export const getMediaTypeIndex = (mediaTypePriorityList: MediaType[], mediaType: string) => {
  return mediaTypePriorityList.findIndex((priorityMediaType) => mediaTypeToRegexMap[priorityMediaType].test(mediaType));
};
