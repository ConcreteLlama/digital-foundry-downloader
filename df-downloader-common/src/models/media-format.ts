import { z } from "zod";

export const MediaFormat = z.enum(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264", "MP3"]);
export type MediaFormat = z.infer<typeof MediaFormat>;

export const mediaFormatToRegexMap: Record<MediaFormat, RegExp> = {
    HEVC: /HEVC/i,
    "h.264 (4K)": /h\.?264.*(4K|2160p).*/i,
    "h.264 (1080p)": /h\.?264.*(1080p).*/i,
    "h.264": /h\.?264/i,
    MP3: /mp3/i,
  };
  
  const audioFormats = new Set<MediaFormat>(["MP3"]);
  const videoFormats = new Set<MediaFormat>(["HEVC", "h.264 (4K)", "h.264 (1080p)", "h.264"]);
  
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
  
  export const getMatchingMediaFormat = (
    mediaTypePriorityList: MediaFormat[],
    mediaTypeString: string,
    mustMatch: boolean = false
  ) => {
    for (const mediaType of mediaTypePriorityList) {
      if (mediaFormatToRegexMap[mediaType].test(mediaTypeString)) {
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
  export const getMediaFormatIndex = (mediaTypePriorityList: MediaFormat[], mediaType: string) => {
    return mediaTypePriorityList.findIndex((priorityMediaFormat) => mediaFormatToRegexMap[priorityMediaFormat].test(mediaType));
  };
  