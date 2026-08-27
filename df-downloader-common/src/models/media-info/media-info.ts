import { z } from "zod";
import { stringToDuration } from "../../utils/time-utils.js";
import { MediaFormat } from "./media-format.js";
import { getMostImportantItem } from "../../utils/importance-list.js";
import { MediaEncoding } from "./media-encoding.js";
import { VideoProperties } from "./video-properties.js";
import { AudioProperties } from "./audio-properties.js";

export const MediaType = z.enum(["VIDEO", "AUDIO", "ARCHIVE", "UNKNOWN"]);
export type MediaType = z.infer<typeof MediaType>;

/**
 * Where a MediaInfo's `duration` came from. Digital Foundry's own listing
 * stopped carrying a duration when the site relaunched (see
 * docs/DF_SITE_MIGRATION.md), so it's now backfilled from YouTube - but
 * YouTube's timeline includes the sponsorship segment that DF's own
 * downloads have cut out, making it up to ~1.5 minutes longer than the
 * file on disk. Once a file has actually been downloaded we ffprobe it and
 * overwrite the duration with the real measurement; `measured` marks that,
 * and is the only source trustworthy enough to derive a sponsorship offset
 * from (see sponsorship.ts). `undefined` means the value predates this
 * field - treat it as unknown, not as measured.
 */
export const DurationSource = z.enum(["youtube", "measured"]);
export type DurationSource = z.infer<typeof DurationSource>;

export const MediaInfo = z.object({
  duration: z.string().optional(),
  durationSource: DurationSource.optional(),
  size: z.number().optional(),
  type: MediaType,
  formatString: z.string(),
  encoding: MediaEncoding,
  videoProperties: VideoProperties.nullable(),
  audioProperties: AudioProperties.nullable(),
  videoId: z.string().optional(),
  mediaFilename: z.string().optional(),
  downloadUrl: z.string().optional(),
});
export type MediaInfo = z.infer<typeof MediaInfo>;

export const MediaInfoUtils = {
  getDurationSeconds(mediaInfoList: MediaInfo[]) {
    for (const mediaInfo of mediaInfoList) {
      if (mediaInfo.duration) {
        try {
          const toReturn = stringToDuration(mediaInfo.duration);
          return toReturn;
        } catch (e) { }
      }
    }
    return 0;
  },
  getExtension(mediaInfo: MediaInfo) {
    if (mediaInfo.mediaFilename) {
      return mediaInfo.mediaFilename.split(".").pop() || "mp4";
    }
    return mediaInfo.formatString === "MP3" ? "mp3" : "mp4";
  },
};