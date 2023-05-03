import { z } from "zod";

export const DeepgramConfig = z.object({
  apiKey: z.string().min(30),
});
export type DeepgramConfig = z.infer<typeof DeepgramConfig>;

export const SubtitlesService = z.enum(["deepgram"]);
export type SubtitlesService = z.infer<typeof SubtitlesService>;

export const SubtitlesConfig = z
  .object({
    subtitlesService: SubtitlesService.nullable().optional(),
    deepgram: DeepgramConfig.optional(),
  })
  .refine(
    (args) => (args.subtitlesService ? args[args.subtitlesService] : true),
    (args) => ({
      message: `Subtitles service set to ${args.subtitlesService} but ${args.subtitlesService} not set`,
    })
  );
export type SubtitlesConfig = z.infer<typeof SubtitlesConfig>;
export const SubtitlesConfigKey = "subtitles";
