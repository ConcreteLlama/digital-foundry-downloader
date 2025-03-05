import { z } from "zod";
import { RawMediaInfo } from "./raw-media-info.js";

export const MediaEncoding = z.enum([
  "h264",
  "HEVC",
  "MP3",
  "Unknown",
]);
export type MediaEncoding = z.infer<typeof MediaEncoding>;

export const mediaEncodingRegex: Partial<Record<MediaEncoding, RegExp>> = {
  HEVC: /HEVC/i,
  "h264": /h\.?264/i,
  MP3: /mp3/i,
};

export const videoEncodings = new Set<MediaEncoding>(["h264", "HEVC"]);
export const audioEncodings = new Set<MediaEncoding>(["MP3"]);

export const inferMediaEncoding = (mediaInfo: RawMediaInfo) => {
  for (const [encoding, regex] of Object.entries(mediaEncodingRegex)) {
      if (regex.test(mediaInfo.format)) {
          return encoding as MediaEncoding;
      }
  }
  return "Unknown";
}