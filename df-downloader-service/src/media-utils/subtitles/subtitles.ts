import { SubtitlesConfig, SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { LanguageCode } from "df-downloader-common";
import { DeepgramSubtitleGenerator } from "./deepgram.js";
import { serviceLocator } from "../../services/service-locator.js";
import { DfContentInfo, logger } from "df-downloader-common";
import { configService } from "../../config/config.js";
import { YoutubeSubtitleGenerator } from "./youtube.js";
import { GoogleSttSubtitlesGenerator } from "./google-stt.js";

export type SubtitleInfo = {
  srt: string;
  language: string;
  service: SubtitlesService;
};

export interface SubtitleGenerator {
  serviceType: SubtitlesService;
  getSubs(dfContentInfo: DfContentInfo, filename: string, language: LanguageCode): Promise<SubtitleInfo>;
  destroy(): void;
}

const setServiceConfig = (subtitleConfig?: SubtitlesConfig) => {
  serviceLocator.setSubtitleGenerators([]);
  if (!subtitleConfig) {
    return;
  }
  const { services } = subtitleConfig;
  if (services?.deepgram) {
    serviceLocator.addSubtitleGenerator(new DeepgramSubtitleGenerator(services.deepgram.apiKey));
  }
  if (services?.google_stt) {
    serviceLocator.addSubtitleGenerator(new GoogleSttSubtitlesGenerator(services.google_stt.apiKey));
  }
  serviceLocator.addSubtitleGenerator(new YoutubeSubtitleGenerator());
};

export const loadSubtitlesService = () => {
  setServiceConfig(configService.config.subtitles);
  configService.on("configUpdated:subtitles", (event) => {
    const config = event?.newValue;
    setServiceConfig(config);
  });
};
