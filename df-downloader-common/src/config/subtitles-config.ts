import { z } from "zod";

export const DeepgramConfig = z.object({
  /** Deepgram API key */
  apiKey: z.string().min(30),
});
export type DeepgramConfig = z.infer<typeof DeepgramConfig>;

export const GoogleSttConfig = z.object({
  apiKey: z.string().min(30),
});
export type GoogleSttConfig = z.infer<typeof GoogleSttConfig>;

/**
 * Whisper models, smallest/fastest first. Measured on a 660s video
 * (Ryzen 9 9950X3D, 16 threads) and scaled to the project owner's Unraid
 * i3-N305 (8 Alder Lake-N E-cores), which is roughly 6-8x slower:
 *
 *   tiny.en   51x realtime  -> ~17 min for a 2-hour DF Direct on the N305
 *   base.en   35x realtime  -> ~24 min
 *   small.en  14x realtime  -> ~60 min
 *
 * Accuracy on Digital Foundry content specifically: small.en matched
 * YouTube's own ASR on every proper noun tested (GeForce, 4A Games, Metro
 * 2039); base.en missed some; tiny.en missed all of them and isn't really
 * usable for this content. Larger models exist and are selectable, but
 * medium/large on a low-power box means hours per Direct.
 */
export const WhisperModel = z.enum([
  "tiny.en",
  "tiny",
  "base.en",
  "base",
  "small.en",
  "small",
  "medium.en",
  "medium",
  "large-v3",
  "large-v3-turbo",
]);
export type WhisperModel = z.infer<typeof WhisperModel>;

/**
 * A literal find/replace applied to Whisper's output.
 *
 * Speech-to-text reliably mangles domain jargon, and this content is full
 * of it. Confirmed empirically: "UE5" came out as "UA5" from Whisper and
 * "U5" from YouTube's own ASR, on every model tested. Whisper's initial
 * prompt is *not* a fix for this - it only conditions the first 30-second
 * window, and was measured to change nothing across a full transcript - so
 * a substitution list is the mechanism that actually works.
 */
export const WhisperTermCorrection = z.object({
  /** Text as Whisper transcribes it, e.g. "UA5". */
  from: z.string().min(1),
  /** What it should say, e.g. "UE5". */
  to: z.string(),
  /** Match regardless of case. Defaults to whole-word, case-sensitive. */
  caseInsensitive: z.boolean().default(false),
});
export type WhisperTermCorrection = z.infer<typeof WhisperTermCorrection>;

export const WhisperConfig = z.object({
  /** Which model to transcribe with - see WhisperModel for speed/accuracy notes. */
  model: WhisperModel.default("base.en"),
  /**
   * Threads for whisper.cpp. Defaults to two below the CPU's core count so
   * a transcription doesn't starve everything else on the box (this
   * typically runs on a NAS that's also serving media).
   */
  threads: z.number().int().min(1).optional(),
  /**
   * Path to the whisper.cpp `whisper-cli` binary. The Docker image builds
   * one and points this at it; set it explicitly to run against your own
   * build (e.g. for local development outside the container).
   */
  binaryPath: z.string().optional(),
  /**
   * Where model files are downloaded and cached. Defaults to a `whisper`
   * directory alongside the app's other data. Models are fetched on first
   * use rather than baked into the image - they range from 75MB to ~3GB.
   */
  modelDir: z.string().optional(),
  /** Spoken language, or "auto" to let Whisper detect it. */
  language: z.string().default("en"),
  /** See WhisperTermCorrection - fixes jargon that speech-to-text reliably mangles. */
  termCorrections: z.array(WhisperTermCorrection).default([]),
});
export type WhisperConfig = z.infer<typeof WhisperConfig>;

export const SubtitlesService = z.enum(["deepgram", "google_stt", "whisper"]);
export type SubtitlesService = z.infer<typeof SubtitlesService>;

/**
 * When subtitles get generated automatically, if at all.
 *
 * `off` still leaves manual generation available - some content is worth
 * subtitling and some isn't, and there was previously no way to express
 * that: the only switch also governed whether services could be configured
 * at all.
 *
 * `during_download` is the original behaviour: the download isn't considered
 * finished until subtitles exist. Simple, but with local transcription a
 * long video holds its own download open for tens of minutes.
 */
export const AutomaticSubtitlesMode = z.enum(["off", "during_download"]);
export type AutomaticSubtitlesMode = z.infer<typeof AutomaticSubtitlesMode>;

export const SubtitlesServicesConfig = z.object({
  /** Deepgram configuration */
  deepgram: DeepgramConfig.optional(),
  /** Google STT configuration */
  google_stt: GoogleSttConfig.optional(),
  /** Local Whisper transcription - no API key, no per-use cost, runs on this machine */
  whisper: WhisperConfig.optional(),
});
export type SubtitlesServicesConfig = z.infer<typeof SubtitlesServicesConfig>;

export const SubtitlesConfig = z
  .object({
    /** See AutomaticSubtitlesMode. */
    automaticGeneration: AutomaticSubtitlesMode.default("during_download"),
    /**
     * How many subtitle generations may run at once.
     *
     * Defaults to 1, deliberately. This was effectively 5 back when
     * subtitles meant an API call to Deepgram or a caption fetch from
     * YouTube - network-bound work where running several at once is free.
     * Local Whisper transcription is the opposite: each run is CPU-bound and
     * already claims most of the machine's cores (see WhisperConfig.threads),
     * so allowing several concurrently oversubscribes the CPU several times
     * over and makes everything - including anything else running on the same
     * box - crawl. Raise it only if your subtitles service is a remote API.
     */
    maxConcurrent: z.number().int().min(1).default(1),
    /** The subtitles service to use */
    servicePriorities: SubtitlesService.array().default([]),
    /** The configuration for each subtitles service */
    services: SubtitlesServicesConfig.optional(),
  })
  .superRefine((args, ctx) => {
    // zod v4 removed the function-returning-an-issue-object overload of
    // refine()'s second arg (it's message-string/static-params only now) -
    // superRefine()+ctx.addIssue() is the v4-correct way to get a dynamic
    // message here.
    const allConfigured = args.servicePriorities && args.servicePriorities.every((service) => Boolean(args.services?.[service]));
    if (!allConfigured) {
      ctx.addIssue({
        code: "custom",
        message: `Subtitles service list includes ${args.servicePriorities} but not all services are configured`,
      });
    }
  });
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
    return SubtitlesService.options.filter((service) =>
      SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
  getConfiguredServices: (config: SubtitlesServicesConfig) => {
    return SubtitlesService.options.filter((service) =>
      SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
  getNonConfiguredServices: (config: SubtitlesServicesConfig) => {
    return SubtitlesService.options.filter(
      (service) => !SubtitlesConfigUtils.isAvailable(service, config)
    );
  },
};
