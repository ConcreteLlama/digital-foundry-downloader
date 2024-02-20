import { z } from "zod";

export const DeepgramConfig = z.object({
  /** Deepgram API key */
  apiKey: z.string().min(30),
});
export type DeepgramConfig = z.infer<typeof DeepgramConfig>;

export const YoutubeConfig = z.object({});
export type YoutubeConfig = z.infer<typeof YoutubeConfig>;

export const GoogleSttConfig = z.object({
  apiKey: z.string().min(30),
});
export type GoogleSttConfig = z.infer<typeof GoogleSttConfig>;

export const SubtitlesService = z.enum(["deepgram", "youtube", "google_stt"]);
export type SubtitlesService = z.infer<typeof SubtitlesService>;

export const SubtitlesServicesConfig = z.object({
  /** Deepgram configuration */
  deepgram: DeepgramConfig.optional(),
  /** Youtube configuration
   * Basically we don't need to configure anything for youtube but we need to have this field to be able to use it **/
  youtube: YoutubeConfig.default({}).optional(),
  /** Google STT configuration */
  google_stt: GoogleSttConfig.optional(),
});
export type SubtitlesServicesConfig = z.infer<typeof SubtitlesServicesConfig>;

export const SubtitlesConfig = z
  .object({
    /** Whether to auto-generate subs on download */
    autoGenerateSubs: z.boolean().default(true),
    /** The subtitles service to use */
    servicePriorities: SubtitlesService.array().default([]),
    /** The configuration for each subtitles service */
    services: SubtitlesServicesConfig.optional(),
  })
  .refine(
    (args) => args.servicePriorities && args.servicePriorities.every((service) => Boolean(args.services?.[service])),
    (args) => ({
      message: `Subtitles service list includes ${args.servicePriorities} but not all services are configured`,
    })
  );
export type SubtitlesConfig = z.infer<typeof SubtitlesConfig>;
export const SubtitlesConfigKey = "subtitles";

export const SubtitlesConfigUtils = {
  isAvailable: (service: SubtitlesService, services: SubtitlesServicesConfig) => {
    return Boolean(services?.[service]);
  },
  isConfigured: (service: SubtitlesService, config: SubtitlesConfig) => {
    return SubtitlesConfigUtils.isAvailable(service, config.services || {});
  },
  getAvailableServices: (config: SubtitlesServicesConfig) => {
    return Object.values(SubtitlesService.Values).filter((service) =>
      SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
  getConfiguredServices: (config: SubtitlesServicesConfig) => {
    return Object.values(SubtitlesService.Values).filter((service) =>
      SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
  getNonConfiguredServices: (config: SubtitlesServicesConfig) => {
    return Object.values(SubtitlesService.Values).filter(
      (service) => !SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
};
