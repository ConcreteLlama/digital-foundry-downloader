import { SubtitlesConfig } from "df-downloader-common/config/subtitles-config";
import { DeepgramSubtitleGenerator } from "./deepgram.js";
import { serviceLocator } from "../../services/service-locator.js";
import { LogLevel, logger } from "../../utils/logger.js";
import { configService } from "../../config/config.js";

export type SubtitleInfo = {
  srt: string;
  language: string;
};

export interface SubtitleGenerator {
  getSubs(filename: string, language: string): Promise<SubtitleInfo>;
  destroy(): void;
}

const makeSubtitleGenerator = (config?: SubtitlesConfig): SubtitleGenerator | undefined => {
  if (!config) {
    logger.log(LogLevel.INFO, `No subitle generator configured, disabling subtitles`);
    return;
  }
  if (config.subtitlesService === "deepgram" && config.deepgram) {
    logger.log(LogLevel.INFO, "Creating deepgram subtitle generator");
    return new DeepgramSubtitleGenerator(config.deepgram.apiKey);
  }
  logger.log(LogLevel.INFO, `No subitle generator configured, disabling subtitles`);
  return;
};

export const loadSubtitlesService = () => {
  const subtitleConfig = configService.config.subtitles;
  serviceLocator.subtitleGenerator = makeSubtitleGenerator(subtitleConfig);
  logger.log(LogLevel.INFO, `Init - set subtitle generator to ${subtitleConfig?.subtitlesService}`);
  configService.on("configUpdated:subtitles", (event) => {
    const config = event?.newValue;
    serviceLocator.subtitleGenerator?.destroy();
    try {
      serviceLocator.subtitleGenerator = makeSubtitleGenerator(config);
    } catch (e) {
      logger.log(LogLevel.ERROR, `Failed to update subtitle generator: ${e}`);
      return;
    }
    logger.log(LogLevel.INFO, `Updated subtitle generator to ${config?.subtitlesService}`);
  });
};
