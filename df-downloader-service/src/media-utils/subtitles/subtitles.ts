import { SubtitlesConfig, SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { LanguageCode, SubtitleInfo } from "df-downloader-common";
import { DeepgramSubtitleGenerator } from "./deepgram.js";
import { serviceLocator } from "../../services/service-locator.js";
import { DfContentInfo, logger } from "df-downloader-common";
import { configService } from "../../config/config.js";
import { GoogleSttSubtitlesGenerator } from "./google-stt.js";
import { WhisperSubtitleGenerator } from "./whisper.js";

export type GeneratedSubtitleInfo = SubtitleInfo & {
  service: SubtitlesService;
};

export interface SubtitleGenerator {
  serviceType: SubtitlesService;
  getSubs(dfContentInfo: DfContentInfo, filename: string, language: LanguageCode | string): Promise<GeneratedSubtitleInfo>;
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
  if (services?.whisper) {
    serviceLocator.addSubtitleGenerator(new WhisperSubtitleGenerator(services.whisper));
  }
};

export const loadSubtitlesService = () => {
  setServiceConfig(configService.config.subtitles);
  configService.on("configUpdated:subtitles", (event) => {
    const config = event?.newValue;
    setServiceConfig(config);
  });
};
