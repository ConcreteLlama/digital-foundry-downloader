import { SubtitlesConfig } from "df-downloader-common/config/subtitles-config";
import { DeepgramSubtitleGenerator } from "./deepgram.js";

export type SubtitleInfo = {
  srt: string;
  language: string;
};

export interface SubtitleGenerator {
  getSubs(filename: string, language: string): Promise<SubtitleInfo>;
}

export const makeSubtitleGenerator = (config?: SubtitlesConfig): SubtitleGenerator | undefined => {
  if (!config) {
    return;
  }
  if (config.subtitlesService === "deepgram" && config.deepgram) {
    return new DeepgramSubtitleGenerator(config.deepgram.apiKey);
  }
  return;
};
