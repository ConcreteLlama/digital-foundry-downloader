import got from "got";
import * as CSSSelect from "css-select";
import * as htmlparser2 from "htmlparser2";
import { Element } from "domhandler";
import { getBodyOfChild } from "./dom-utils.js";
import { transformFirstMatch } from "df-downloader-common";
import { generateSrt, secondsToSrtTimestamp } from "../media-utils/subtitles/srt-utils.js";

export const extractYoutubeVideoId = (url: string) => {
  const match = url.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (match) {
    return match[1] || undefined;
  }
  return undefined;
};

export const youtubeUrlToWatchUrl = (url: string) => {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return null;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
};

type CaptionTrack = {
  baseUrl: string;
  name: { simpleText: string };
  vssId: string;
  languageCode: string;
  kind: string;
  isTranslatable: boolean;
  trackName: string;
};

export const fetchSubs = async (videoId: string, language: string) => {
  const response = await got.get(`https://www.youtube.com/watch?v=${videoId}`);
  const dom = htmlparser2.parseDocument(response.body);
  const scriptTags = CSSSelect.selectAll("script", dom);
  const scriptJson = transformFirstMatch(scriptTags, (scriptTag) => {
    const scriptBody = getBodyOfChild(scriptTag);
    if (!scriptBody?.includes("ytInitialPlayerResponse")) {
      return;
    }
    // Need to match all text over multiple lines between "ytInitialPlayerResponse = {" and the next } to get the JSON
    // This could be over multiple lines, so we use the s flag to allow . to match newlines
    const ytInitialPlayerResponse = scriptBody.match(/ytInitialPlayerResponse = ({.*});/s);
    if (ytInitialPlayerResponse) {
      const playerResponse = JSON.parse(ytInitialPlayerResponse[1]);
      return playerResponse;
    }
  });
  if (!scriptJson) {
    throw new Error("Failed to find ytInitialPlayerResponse");
  }
  const track = scriptJson.captions?.playerCaptionsTracklistRenderer?.captionTracks.find(
    (track: CaptionTrack) => track.languageCode?.toLowerCase() === language?.toLowerCase()
  ) as CaptionTrack | undefined;
  const trackUrl = track?.baseUrl;
  if (!trackUrl) {
    throw new Error(`No track found for language ${language}`);
  }
  // Now fetch the actual captions
  const captionsResponse = await got.get(trackUrl);
  return captionsResponse.body;
};

export type YoutubeSubtitleLine = {
  start: number;
  dur: number;
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
  const subs = await fetchSubs(videoId, language);
  return parseSubs(subs);
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
