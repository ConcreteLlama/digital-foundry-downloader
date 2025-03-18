import * as z from "zod";
import { SubtitlesService } from "../config/subtitles-config.js";

export const LanguageCode = z.enum(["en"]);
export type LanguageCode = z.infer<typeof LanguageCode>;

export const GenerateSubtitlesRequest = z.object({
  /** The name of the content to generate subtitles for. This will be used to
   * look up the relevant content info and validate the file matches the content
   */
  dfContentName: z.string(),
  /** The media file to generate subtitles for */
  mediaFilePath: z.string(),
  /** The language to generate subtitles for */
  language: z.union([LanguageCode, z.string()]).default("en"),
  /** The subtitles service to generate/fetch the subtitles with */
  subtitlesService: SubtitlesService.optional(),
});
export type GenerateSubtitlesRequest = z.infer<typeof GenerateSubtitlesRequest>;

export const SrtTimestamp = z.object({
  hours: z.number(),
  minutes: z.number(),
  seconds: z.number(),
  milliseconds: z.number(),
});
export type SrtTimestamp = z.infer<typeof SrtTimestamp>;

export const SrtLine = z.object({
  start: SrtTimestamp,
  end: SrtTimestamp,
  transcript: z.string(),
});
export type SrtLine = z.infer<typeof SrtLine>;

export const SubtitleInfo = z.object({
  language: z.union([LanguageCode, z.string()]),
  lines: SrtLine.array(),
});
export type SubtitleInfo = z.infer<typeof SubtitleInfo>;