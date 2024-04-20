import { DfContentInfo, logger, LanguageCode } from "df-downloader-common";
import { fetchAndParseSubs, youtubeSubsToSrt } from "../../utils/youtube.js";
import { SubtitleGenerator } from "./subtitles.js";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";

export class YoutubeSubtitleGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "youtube";
  constructor() {}
  async getSubs(dfContentInfo: DfContentInfo, filename: string, language: LanguageCode) {
    logger.log("info", `Fetching ${language} from Youtube for ${filename}`);
    if (!dfContentInfo.youtubeVideoId) {
      throw new Error("No youtube video id");
    }
    const subs = await fetchAndParseSubs(dfContentInfo.youtubeVideoId, language);
    if (!subs) {
      throw new Error("Failed to fetch subs");
    }
    return { srt: youtubeSubsToSrt(subs), language, service: this.serviceType };
  }
  destroy(): void {
    // Nothing to do
  }
}
