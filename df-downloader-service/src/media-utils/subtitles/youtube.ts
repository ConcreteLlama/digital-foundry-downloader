import { DfContentInfo, LanguageCode, MediaInfoUtils, logger } from "df-downloader-common";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { fetchAndParseSubs, youtubeSubsToSrt } from "../../utils/youtube.js";
import { SubtitleGenerator } from "./subtitles.js";

export class YoutubeSubtitleGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "youtube";
  constructor() {}
  async getSubs(dfContentInfo: DfContentInfo, filename: string, language: LanguageCode) {
    logger.log("info", `Fetching ${language} from Youtube for ${filename}`);
    if (!dfContentInfo.youtubeVideoId) {
      throw new Error("No youtube video id");
    }
    let { subs, durationMs } = await fetchAndParseSubs(dfContentInfo.youtubeVideoId, language);
    if (!subs) {
      throw new Error("Failed to fetch subs");
    }
    const youtubeDurationS = durationMs / 1000;
    const videoLengthS = MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo);
    const offset = youtubeDurationS - videoLengthS;
    if (youtubeDurationS && videoLengthS && Math.abs(offset) > 5) {
      if (offset < 0) {
        // Youtube duration is shorter than video length
        logger.log(
          "warn",
          `Youtube duration is shorter than video length by ${-offset} seconds - subs may not be in sync`
        );
      } else {
        // Youtube duration is longer than video length, indicating video starts with sponsorship. We should
        // still be able to use the subs and strip the first offset seconds
        logger.log(
          "info",
          `Youtube duration is longer than video length by ${offset} seconds - subs will be trimmed from the start`
        );
        subs = subs
          .map((sub, i) => ({
            ...sub,
            start: sub.start - offset,
          }))
          .filter((sub) => sub.start >= 0);
      }
    }
    const srt = youtubeSubsToSrt(subs);
    return { srt, language, service: this.serviceType };
  }
  destroy(): void {
    // Nothing to do
  }
}
