import * as CSSSelect from "css-select";
import { transformFirstMatch } from "df-downloader-common";
import * as htmlparser2 from "htmlparser2";
import { getBodyOfChild } from "../dom-utils.js";
import { YtInitialData, YtInitialPlayerResponse } from "./types.js";

type HDocument = ReturnType<typeof htmlparser2.parseDocument>;

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

const getScriptJson = <T>(dom: HDocument, varName: string): T => {
  const scriptTags = CSSSelect.selectAll("script", dom);
  const scriptJson = transformFirstMatch(scriptTags, (scriptTag) => {
    const scriptBody = getBodyOfChild(scriptTag);
    if (!scriptBody?.includes(varName)) {
      return;
    }
    const jsonMatch = scriptBody.match(new RegExp(`${varName} = ({.*});`, "s"));
    if (jsonMatch) {
      const playerResponse = JSON.parse(jsonMatch[1]);
      return playerResponse;
    }
  });
  if (!scriptJson) {
    throw new Error(`Failed to find script with variable ${varName}`);
  }
  return scriptJson;
}

export const fetchYtVideoPageDom = async (videoId: string) => {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch video page: ${response.statusText}`);
  }
  const responseText = await response.text();
  return htmlparser2.parseDocument(responseText);
};

const fetchScriptJson = async<T>(videoId: string, varName: string): Promise<T> => getScriptJson<T>(await fetchYtVideoPageDom(videoId), varName);

export const fetchInitialPlayerResponse = async (videoId: string) => fetchScriptJson<YtInitialPlayerResponse>(videoId, "ytInitialPlayerResponse");
export const fetchYtInitialData = async (videoId: string) => fetchScriptJson<YtInitialData>(videoId, "ytInitialData");

export const getInitialPlayerResponse = (dom: HDocument) => getScriptJson<YtInitialPlayerResponse>(dom, "ytInitialPlayerResponse");
export const getInitialData = (dom: HDocument) => getScriptJson<YtInitialData>(dom, "ytInitialData");