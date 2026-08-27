import { DfContentInfo, LanguageCode, logger } from "df-downloader-common";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { fetchAndParseSubs, youtubeSubsToSrt } from "../../utils/youtube/youtube-subs.js";
import { applySponsorSegmentToSubs } from "../../utils/youtube/sponsorship.js";
import { GeneratedSubtitleInfo, GetSubsOpts, SubtitleGenerator } from "./subtitles.js";

export class YoutubeSubtitleGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "youtube";
  constructor() {}
  async getSubs(
    dfContentInfo: DfContentInfo,
    filename: string,
    language: LanguageCode,
    opts: GetSubsOpts = {}
  ): Promise<GeneratedSubtitleInfo> {
    logger.log("info", `Fetching ${language} from Youtube for ${filename}`);
    if (!dfContentInfo.youtubeVideoId) {
      throw new Error("No youtube video id");
    }
    let { subs } = await fetchAndParseSubs(dfContentInfo.youtubeVideoId, language);
    if (!subs) {
      throw new Error("Failed to fetch subs");
    }
    // These subs are timed against YouTube's upload, which for sponsored
    // videos contains a sponsorship read that DF cut out of the file we
    // just downloaded. The caller works out whether that happened - it
    // needs the file's real ffprobe-measured duration and YouTube's chapter
    // list to do so, neither of which is available from here - and hands
    // down the exact segment to remove.
    //
    // Note this deliberately does *not* fall back to inferring an offset
    // from `dfContentInfo.mediaInfo`'s duration when no segment is supplied.
    // That duration is itself backfilled from YouTube unless the file has
    // been measured, so comparing the two compared YouTube against itself
    // and produced an offset of zero; and even with a real measurement, the
    // resulting shift assumed the missing segment was at the very start,
    // which it never is - it follows a short intro, so shifting everything
    // destroyed that intro's subtitles to fix the rest.
    if (opts.sponsorSegment) {
      logger.log(
        "info",
        `Removing the "${opts.sponsorSegment.title}" segment (${
          opts.sponsorSegment.durationMs / 1000
        }s at ${opts.sponsorSegment.startMs / 1000}s) from ${filename}'s subtitles`
      );
      subs = applySponsorSegmentToSubs(subs, opts.sponsorSegment);
    }
    const lines = youtubeSubsToSrt(subs);
    return { lines, language, service: this.serviceType };
  }
  destroy(): void {
    // Nothing to do
  }
}
