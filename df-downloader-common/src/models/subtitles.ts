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
  language: LanguageCode.default("en"),
  /** The subtitles service to generate/fetch the subtitles with */
  subtitlesService: SubtitlesService.default("youtube"),
});
