import { SubtitlesConfig, SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { LanguageCode, SubtitleInfo } from "df-downloader-common";
import { DeepgramSubtitleGenerator } from "./deepgram.js";
import { serviceLocator } from "../../services/service-locator.js";
import { DfContentInfo, logger } from "df-downloader-common";
import { configService } from "../../config/config.js";
import { YoutubeSubtitleGenerator } from "./youtube.js";
import { GoogleSttSubtitlesGenerator } from "./google-stt.js";
import type { SponsorSegment } from "../../utils/youtube/sponsorship.js";

export type GeneratedSubtitleInfo = SubtitleInfo & {
  service: SubtitlesService;
};

export type GetSubsOpts = {
  /**
   * A segment present in the source the subtitles come from but absent from
   * the downloaded file - in practice the sponsorship read DF cut out of
   * their own copy. Only meaningful to generators that source subtitles
   * from elsewhere (YouTube); generators that transcribe the downloaded
   * file itself are already timed against it and ignore this.
   */
  sponsorSegment?: SponsorSegment | null;
};

export interface SubtitleGenerator {
  serviceType: SubtitlesService;
  getSubs(
    dfContentInfo: DfContentInfo,
    filename: string,
    language: LanguageCode | string,
    opts?: GetSubsOpts
  ): Promise<GeneratedSubtitleInfo>;
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
