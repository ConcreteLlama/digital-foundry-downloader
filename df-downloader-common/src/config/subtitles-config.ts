import { z } from "zod";

export const DeepgramConfig = z.object({
  /** Deepgram API key */
  apiKey: z.string().min(30).describe("Your Deepgram API key, created in the Deepgram console."),
});
export type DeepgramConfig = z.infer<typeof DeepgramConfig>;

export const GoogleSttConfig = z.object({
  apiKey: z
    .string()
    .min(30)
    .describe("Your Google Cloud API key, with the Speech-to-Text API enabled on the project it belongs to."),
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
  from: z.string().min(1).describe('The word as Whisper writes it down, e.g. "UA5".'),
  /** What it should say, e.g. "UE5". */
  to: z.string().describe('What it should have said, e.g. "UE5".'),
  /** Match regardless of case. Defaults to whole-word, case-sensitive. */
  caseInsensitive: z
    .boolean()
    .default(false)
    .describe("Match the word however it happens to be capitalised. Whole-word and case-sensitive otherwise."),
});
export type WhisperTermCorrection = z.infer<typeof WhisperTermCorrection>;

export const WhisperConfig = z.object({
  /** Which model to transcribe with - see WhisperModel for speed/accuracy notes. */
  model: WhisperModel.default("base.en").describe(
    "Larger models are more accurate but considerably slower. base.en is a reasonable balance; small.en matches YouTube's own captions on proper nouns but takes around three times as long; tiny.en is fast but misses names entirely."
  ),
  /**
   * Threads for whisper.cpp. Defaults to two below the CPU's core count so
   * a transcription doesn't starve everything else on the box (this
   * typically runs on a NAS that's also serving media).
   */
  threads: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "How many CPU threads to transcribe with. Defaults to two fewer than this machine has cores, so transcribing does not starve everything else running on it."
    ),
  /**
   * Whether whisper.cpp may use a GPU when one is available.
   *
   * The binary bundled in the Docker image is a CPU-only build, so this
   * changes nothing there - it matters when `binaryPath` points at a
   * CUDA/Vulkan/OpenVINO build. Worth being able to turn off rather than
   * assuming a GPU is a win: on the kind of box this usually runs on, the
   * GPU is often already busy transcoding for a media server, and competing
   * for it can be slower than staying on the CPU as well as making playback
   * stutter.
   */
  useGpu: z
    .boolean()
    .default(true)
    .describe(
      "Let Whisper use a GPU when one is available. The build bundled in the Docker image is CPU-only, so this only matters once the binary path points at your own GPU-enabled build - and it is worth leaving off even then if that GPU is already busy transcoding for a media server."
    ),
  /**
   * Path to the whisper.cpp `whisper-cli` binary. The Docker image builds
   * one and points this at it; set it explicitly to run against your own
   * build (e.g. for local development outside the container).
   */
  binaryPath: z
    .string()
    .optional()
    .describe("Path to the whisper.cpp 'whisper-cli' binary. Leave blank to use the one bundled in the Docker image."),
  /**
   * Where model files are downloaded and cached. Defaults to a `whisper`
   * directory alongside the app's other data. Models are fetched on first
   * use rather than baked into the image - they range from 75MB to ~3GB.
   */
  modelDir: z
    .string()
    .optional()
    .describe(
      "Where model files are downloaded and cached. Defaults to a folder alongside your config. Models are fetched the first time they are used and range from 75MB to around 3GB."
    ),
  /** Spoken language, or "auto" to let Whisper detect it. */
  language: z.string().default("en").describe('The spoken language of the audio, or "auto" to let Whisper work it out.'),
  /** See WhisperTermCorrection - fixes jargon that speech-to-text reliably mangles. */
  termCorrections: z
    .array(WhisperTermCorrection)
    .default([])
    .describe(
      'Fixes words Whisper consistently mishears. Matches whole words only - for example, replacing "UA5" with "UE5".'
    ),
});
export type WhisperConfig = z.infer<typeof WhisperConfig>;

/**
 * Listed with the recommended option first - this order is what the settings
 * form presents, and nothing depends on it otherwise, so please don't sort it
 * alphabetically.
 *
 * Whisper leads because it is the one most people should use: no API key, no
 * per-use cost, no third party who can change their terms or withdraw the
 * service. The other two are paid APIs, kept for anyone who would rather rent
 * the CPU time than spend their own.
 */
export const SubtitlesService = z.enum(["whisper", "deepgram", "google_stt"]);
export type SubtitlesService = z.infer<typeof SubtitlesService>;

/**
 * How generated subtitles reach the video.
 *
 * `embed` remuxes them into the file itself, so they travel with it if it's
 * moved or copied. The cost is that it rewrites the whole file - fine while
 * the download is still being assembled and nothing has seen it, less so
 * once it's sitting in a library a media server has indexed.
 *
 * `sidecar` writes a separate .srt alongside the video, which Plex and
 * Jellyfin both read. Near-instant, no rewrite of a multi-gigabyte file, and
 * nothing touches a file that might be playing - but the subtitles are left
 * behind if the video is moved without them.
 *
 * `auto` picks per situation: embed while the download is being assembled,
 * sidecar when subtitles are generated for a file already in the library.
 * That gets the durability of embedding where it's free, and avoids
 * rewriting files that are already in use.
 *
 * `both` embeds and writes the sidecar. Useful precisely because of the
 * interaction described below: with deferred generation `auto` never
 * embeds, so this is the only way to get subtitles that both travel with
 * the file and sit beside it where a media server will find them without
 * reading the container.
 *
 * Note how this interacts with AutomaticSubtitlesMode, because it isn't
 * obvious from either setting alone: `after_download` always generates
 * against a file that has already been filed, so `auto` resolves to sidecar
 * every time and the embed branch is never reached. Anyone wanting embedded
 * subtitles with deferred generation has to choose `embed` explicitly - and
 * should know they're asking for a full rewrite of a file already in their
 * library.
 */
export const SubtitlesOutputMode = z
  .enum(["auto", "embed", "sidecar", "both"])
  .describe(
    "Embedding puts subtitles inside the video so they travel with it, but rewrites the whole file. A separate .srt is instant and does not touch a file your media server may be playing, but is left behind if you move the video without it. Both does exactly that - the subtitles travel with the file and are readable beside it. Note that with 'After download' selected above, Automatic always means a separate file - the video is already in your library by the time subtitles are made."
  );
export type SubtitlesOutputMode = z.infer<typeof SubtitlesOutputMode>;

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
 *
 * `after_download` files the video first and generates subtitles afterwards,
 * so it's watchable immediately. The pipeline's position is persisted (see
 * db/pipeline-db-model.ts), so a restart part-way through picks up where it
 * left off rather than re-downloading.
 */
export const AutomaticSubtitlesMode = z
  .enum(["off", "during_download", "after_download"])
  .describe(
    "Generating subtitles locally can take a while for long videos, so you may prefer the download to finish first - or to only ever trigger it yourself, per item."
  );
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

/**
 * Exported separately so the settings form can take its bounds from here
 * rather than restating them. SubtitlesConfig itself carries a superRefine,
 * which leaves it without a `.shape` to reach into.
 */
export const MaxConcurrentSubtitles = z
  .number()
  .int()
  .min(1)
  .describe(
    "How many subtitle jobs may run at once. Transcribing locally already uses most of this machine's cores, so running several at a time makes everything slower rather than finishing sooner. Worth raising only if you use a paid service, where the work happens elsewhere."
  );

export const SubtitlesConfig = z
  .object({
    /** See AutomaticSubtitlesMode. */
    automaticGeneration: AutomaticSubtitlesMode.default("during_download"),
    /** See SubtitlesOutputMode. */
    output: SubtitlesOutputMode.default("auto"),
    /**
     * Also write the .srt beside the video when subtitles are being embedded.
     *
     * Off by default, deliberately: turning it on starts writing new files
     * into a library that already exists, which is not something to do to
     * someone without being asked. With the default "auto" output mode a
     * fresh download embeds its subtitles and no .srt is ever written, so
     * there is no transcript on disk to open, search, or feed to anything
     * else - this is how you get one without giving up embedding.
     */
    keepTranscript: z
      .boolean()
      .default(false)
      .describe(
        "Also save the subtitles as a separate .srt next to the video, even when they are being embedded in it. Useful if you want a readable transcript you can search or open on its own - embedding alone leaves no file to read."
      ),
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
    maxConcurrent: MaxConcurrentSubtitles.default(1),
    /** The subtitles service to use */
    servicePriorities: SubtitlesService.array()
      .default([])
      .describe(
        "Services are tried in this order, for both automatic and manual generation. If one fails the next is used, and with none enabled subtitles cannot be generated at all."
      ),
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
