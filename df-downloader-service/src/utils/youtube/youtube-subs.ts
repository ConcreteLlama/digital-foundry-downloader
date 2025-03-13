import * as CSSSelect from "css-select";
import { Element } from "domhandler";
import * as htmlparser2 from "htmlparser2";
import { generateSrt, secondsToSrtTimestamp } from "../../media-utils/subtitles/srt-utils.js";
import { getBodyOfChild } from "../dom-utils.js";
import { fetchInitialPlayerResponse } from "./youtube-utils.js";
import { YtInitialPlayerResponse } from "./types.js";

export const getYtSubs = async(videoInfo: YtInitialPlayerResponse, language: string) => {
  const track = videoInfo.captions?.playerCaptionsTracklistRenderer?.captionTracks?.find(
    (track) => track.languageCode?.toLowerCase() === language?.toLowerCase()
  );
  const trackUrl = track?.baseUrl;
  if (!trackUrl) {
    throw new Error(`No track found for language ${language}`);
  }
  // Now fetch the actual captions
  const captionsResponse = await fetch(trackUrl);
  if (!captionsResponse.ok) {
    throw new Error(`Failed to fetch captions: ${captionsResponse.statusText}`);
  }
  // Try to get the duration; if we can't, we'll just use the video length field
  let durationMs: number | undefined = (parseInt(videoInfo.videoDetails.lengthSeconds) || 0) * 1000;
  (videoInfo.streamingData?.formats as any[])?.some((format) => {
    if (format.approxDurationMs) {
      durationMs = parseInt(format.approxDurationMs);
      return true;
    }
    return false;
  });
  return {
    subsText: await captionsResponse.text(),
    durationMs,
  };
}

export const fetchYtSubs = async (videoId: string, language: string) => {
  const videoInfo = await fetchInitialPlayerResponse(videoId);
  return await getYtSubs(videoInfo, language);
};

export type YoutubeSubtitleLine = {
  start: number; // Start time in seconds
  dur: number; // Duration in seconds
  text: string;
};

const decodeYoutubeTextString = (text: string) => {
  return text.replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(dec));
};

export const parseSubs = (subs: string): YoutubeSubtitleLine[] => {
  const dom = htmlparser2.parseDocument(subs);
  const textTags = CSSSelect.selectAll("text", dom) as Element[];
  return textTags.map((tag) => ({
    start: parseFloat(tag.attribs?.start),
    dur: parseFloat(tag.attribs?.dur),
    text: decodeYoutubeTextString(getBodyOfChild(tag) || ""),
  }));
};

export const fetchAndParseSubs = async (videoId: string, language: string) => {
  const { subsText, durationMs } = await fetchYtSubs(videoId, language);
  return {
    subs: parseSubs(subsText),
    durationMs,
  };
};

export const youtubeSubsToSrt = (subs: YoutubeSubtitleLine[]): string => {
  return generateSrt(
    subs.map((sub) => ({
      start: secondsToSrtTimestamp(sub.start),
      end: secondsToSrtTimestamp(sub.start + sub.dur),
      transcript: sub.text,
    }))
  );
};
