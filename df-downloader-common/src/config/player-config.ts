import { z } from "zod";

/**
 * Settings for playing a downloaded file in the browser.
 *
 * Exists because a file that is perfect on disk can still be unplayable in a
 * browser. Digital Foundry's downloads carry AC-3 audio, which no browser
 * decodes - Plex and Jellyfin transcode it and are fine, so the file plays
 * everywhere except the one place this app offers a player. The symptom is
 * video with silence and no explanation.
 *
 * The answer is to re-encode only what the browser cannot take and pass the
 * rest through untouched, which for the common case is one audio track and no
 * video work at all.
 */

/**
 * When to hand the browser a re-encoded stream instead of the file itself.
 *
 * Never by default for playable files: a direct file supports byte-range
 * seeking, costs nothing, and is bit-for-bit what was downloaded. Transcoding
 * is a fallback for the case where the alternative is silence, not a better
 * way to play something that already works.
 */
export const PlayerTranscodeMode = z
  .enum(["unsupported_only", "never", "always"])
  .describe(
    "Whether to re-encode a file the browser cannot play. Only what the browser rejects is re-encoded - everything else is passed through untouched."
  );
export type PlayerTranscodeMode = z.infer<typeof PlayerTranscodeMode>;

/**
 * Whether to use the machine's video encoder.
 *
 * Only ever relevant to video. Audio re-encoding is a few percent of one core
 * and hardware encoders do not do audio at all, so this changes nothing for
 * the AC-3 case that motivates the whole feature.
 *
 * Worth having anyway: encoding H.264 in software will not keep up with 4K on
 * a low-power machine, and the fixed-function encoder in an integrated GPU
 * will. That silicon is separate from the compute path used for local AI, so
 * a machine where local analysis on the GPU is unusable can still encode video
 * on it perfectly well.
 */
export const PlayerHardwareAcceleration = z
  .enum(["auto", "off"])
  .describe(
    "Use the machine's video encoder when re-encoding video. Ignored for audio, which no hardware encoder handles."
  );
export type PlayerHardwareAcceleration = z.infer<typeof PlayerHardwareAcceleration>;

/**
 * Whether going fullscreen should turn the screen to landscape.
 *
 * Not a simple on/off, because the honest answer depends on the shape of the
 * screen. On a tall phone, rotating roughly triples the picture and is what
 * every video app does. On a near-square screen - a foldable opened out - it
 * gains almost nothing and just moves everything around, which is worse than
 * leaving it be.
 *
 * "auto" therefore rotates only where it pays: when the screen is clearly
 * taller than it is wide. The other two exist because that is a judgement,
 * and someone who disagrees with it should be able to say so.
 */
export const PlayerFullscreenRotate = z
  .enum(["auto", "always", "never"])
  .describe(
    "Whether fullscreen turns the screen to landscape. Automatic does it only on screens clearly taller than they are wide, where it actually gains picture."
  );
export type PlayerFullscreenRotate = z.infer<typeof PlayerFullscreenRotate>;

/**
 * How large a picture to send when the video has to be re-encoded.
 *
 * Matters more than it sounds. Re-encoding only happens for video a browser
 * cannot play, which here means HEVC, which here means the 4K releases - so
 * the default path was 4K in and 4K out. That is the hardest thing the
 * encoder in an integrated GPU can be asked to do, and it hands the browser a
 * 4K H.264 stream to decode, which is heavier than the HEVC it turned down in
 * the first place. Both ends struggle and the picture stutters.
 *
 * 1080p by default because it removes about three quarters of the work at
 * both ends for a picture nobody watching in a browser tab is likely to miss.
 * The original file is untouched and still what you get everywhere else.
 */
export const PlayerMaxHeight = z
  .enum(["source", "1440p", "1080p", "720p"])
  .describe("The largest picture to send when a video has to be re-encoded. Does not affect files played directly.");
export type PlayerMaxHeight = z.infer<typeof PlayerMaxHeight>;

export const PlayerConfig = z.object({
  transcode: PlayerTranscodeMode.default("unsupported_only").catch("unsupported_only").describe(
    "Digital Foundry's files use AC-3 audio, which browsers cannot decode - so they play with no sound unless this is on. Only the parts the browser rejects are re-encoded; the video is passed through untouched, which costs almost nothing. Always re-encoding is for testing that path, and re-encodes the video too - it is much slower and there is no reason to leave it on."
  ),
  hardwareAcceleration: PlayerHardwareAcceleration.default("auto")
    .catch("auto")
    .describe(
      "Only applies when the video itself has to be re-encoded - the audio never uses it. The Docker image ships an ffmpeg that can use the graphics card, so this works if the card is passed into the container; without one it falls back to the processor, which will not keep up with a large picture. The log says which was used."
    ),
  maxHeight: PlayerMaxHeight.default("1080p")
    .catch("1080p")
    .describe(
      "Only applies to video that has to be re-encoded. Sending 4K means encoding 4K and then asking the browser to decode it, which stutters on modest hardware at both ends - and the file itself is untouched, so this costs nothing you keep. Raise it if your machine and your screen are both up to it."
    ),
  fullscreenRotate: PlayerFullscreenRotate.default("auto")
    .catch("auto")
    .describe(
      "Only applies on a device that can rotate. Automatic turns the screen only where it gains real picture - a tall phone, not a near-square foldable."
    ),
  /**
   * A ceiling on concurrent ffmpeg processes.
   *
   * Each stream is a process that lives as long as someone is watching, and
   * seeking starts a new one - so without a limit a few people scrubbing
   * around could put the machine on its knees. Low by default because this is
   * a personal tool and the realistic audience is one or two people.
   */
  maxConcurrentStreams: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(2)
    .catch(2)
    .describe(
      "How many videos may be re-encoded for playback at once. Each one is a running process; anyone beyond this is asked to wait rather than slowing everybody down."
    ),
});
export type PlayerConfig = z.infer<typeof PlayerConfig>;
export const PlayerConfigKey = "player";
