import { ChildProcess, spawn } from "child_process";
import ffmpegPathImport from "ffmpeg-static";
import { logger } from "df-downloader-common";
import { PlayerConfig } from "df-downloader-common/config/player-config.js";
import { ProbedAudioStream, ProbedVideoStream } from "../utils/media-metadata.js";

const ffmpegPath = ffmpegPathImport as unknown as string;

/**
 * Codecs a browser can be relied on to play, so they are passed through.
 *
 * The point of this whole path is to re-encode as little as possible: a copy
 * is free and lossless, an encode costs CPU and quality. H.264 covers every
 * file this app downloads, and AAC covers everything except the AC-3 tracks
 * that made the feature necessary.
 *
 * Deliberately conservative rather than complete. HEVC and AV1 play in some
 * browsers on some platforms, but "some" is not something to bet a silent or
 * black playback on when the fallback is a cheap re-encode.
 */
const PASSTHROUGH_VIDEO = new Set(["h264"]);
const PASSTHROUGH_AUDIO = new Set(["aac", "mp3", "opus", "vorbis"]);

export type TranscodePlan = {
  video: "copy" | "encode";
  audio: "copy" | "encode";
};

/**
 * What, if anything, has to be re-encoded for a browser.
 *
 * Decided from the file rather than from anything the client claims. The
 * browser's own opinion is what chooses this route in the first place; once
 * here, what the file actually contains is the better authority, and it keeps
 * a hand-crafted request from asking the machine to encode something for no
 * reason.
 */
export const planTranscode = (video?: ProbedVideoStream, audio?: ProbedAudioStream): TranscodePlan => ({
  // Unknown counts as playable: an unrecognised codec that the browser is in
  // fact happy with should not cost a needless encode, and if it genuinely
  // cannot play it the element's error event still catches it.
  video: video?.codecName && !PASSTHROUGH_VIDEO.has(video.codecName) ? "encode" : "copy",
  audio: audio?.codecName && !PASSTHROUGH_AUDIO.has(audio.codecName) ? "encode" : "copy",
});

/** Nothing to do - the file can be served directly, which is always better. */
export const isPassthrough = (plan: TranscodePlan) => plan.video === "copy" && plan.audio === "copy";

/**
 * How many streams may run at once, and what happens when that is reached.
 *
 * Each stream is an ffmpeg process that lives for as long as someone is
 * watching, and every seek kills one and starts another - so without a
 * ceiling a couple of people scrubbing could bury the machine. Refused rather
 * than queued: a viewer waiting for a video that never starts has no way to
 * tell that from a broken one, where an immediate "busy" is at least true.
 *
 * Tracked as live processes rather than as a number.
 *
 * A bare counter only stays correct if every path that increments it also
 * decrements it, and one that did not - a client vanishing during the probe,
 * so the disconnect handler was attached to an already-closed response - left
 * the count permanently high. Every later request was refused, and it
 * presented as the video being unplayable rather than as anything to do with
 * playback having been stopped.
 *
 * Deriving the count from processes that are genuinely still running makes
 * that self-correcting: a slot lost by a bug nobody has found yet comes back
 * as soon as the process behind it exits.
 */
const live = new Set<{ child: ChildProcess }>();

const prune = () => {
  for (const entry of live) {
    if (entry.child.exitCode !== null || entry.child.signalCode !== null || entry.child.killed) {
      live.delete(entry);
    }
  }
};

export const activeTranscodes = () => {
  prune();
  return live.size;
};

export type TranscodeSession = {
  process: ChildProcess;
  /** Releases the slot and kills ffmpeg. Safe to call more than once. */
  stop: () => void;
};

/**
 * Builds the argument list.
 *
 * `-ss` before `-i` on purpose: that seeks by keyframe before decoding, which
 * is near-instant on a large file, where placing it after the input decodes
 * everything up to that point first. The cost is landing on the nearest
 * keyframe rather than the exact second, which for a scrubbing viewer is
 * imperceptible and for the alternative - a minute of decoding before
 * playback starts - is the only workable choice.
 *
 * The output is fragmented MP4 because it has to be: a normal MP4 puts its
 * index at the end, which cannot be written when the length is not known in
 * advance and the bytes are already going down the wire.
 */
const buildArgs = (
  filePath: string,
  startSeconds: number,
  plan: TranscodePlan,
  hardwareAcceleration: PlayerConfig["hardwareAcceleration"]
): string[] => {
  const args: string[] = ["-hide_banner", "-loglevel", "error"];
  if (startSeconds > 0) {
    args.push("-ss", String(startSeconds));
  }
  /*
   * Hardware decode/encode is only set up when video actually needs encoding.
   * Asking for a VAAPI device on a copy does nothing but risk failing to
   * initialise on a machine that has none.
   */
  const useHardware = plan.video === "encode" && hardwareAcceleration === "auto";
  if (useHardware) {
    args.push("-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi");
  }
  args.push("-i", filePath);
  if (plan.video === "copy") {
    args.push("-c:v", "copy");
  } else if (useHardware) {
    args.push("-vf", "scale_vaapi=format=nv12", "-c:v", "h264_vaapi", "-b:v", "8M");
  } else {
    // veryfast rather than a better preset: this has to keep ahead of
    // playback on a low-power machine, and a stream that falls behind stalls
    // the viewer where a slightly larger one does not.
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20");
  }
  if (plan.audio === "copy") {
    args.push("-c:a", "copy");
  } else {
    // Stereo: the browser is the destination, AC-3 sources are 5.1, and a
    // downmix is what every other player does for the same reason.
    args.push("-c:a", "aac", "-b:a", "192k", "-ac", "2");
  }
  args.push(
    "-movflags", "frag_keyframe+empty_moov+default_base_moof",
    "-f", "mp4",
    "pipe:1"
  );
  return args;
};

/**
 * Starts a stream, or returns undefined when the machine is already at its
 * limit.
 *
 * The caller owns stopping it - see stop() - and must do so when the client
 * disconnects, or a closed tab leaves ffmpeg encoding into a pipe nobody
 * reads until it blocks forever.
 */
export const startTranscode = (
  filePath: string,
  startSeconds: number,
  plan: TranscodePlan,
  config: PlayerConfig
): TranscodeSession | undefined => {
  const running = activeTranscodes();
  if (running >= config.maxConcurrentStreams) {
    logger.log("warn", `Refusing a transcode of ${filePath} - ${running} already running`);
    return undefined;
  }
  const args = buildArgs(filePath, startSeconds, plan, config.hardwareAcceleration);
  logger.log(
    "info",
    `Transcoding ${filePath} from ${Math.round(startSeconds)}s (video: ${plan.video}, audio: ${plan.audio})`
  );
  logger.log("debug", `ffmpeg transcode args: ${args.join(" ")}`);
  const child = spawn(ffmpegPath, args);
  const entry = { child };
  live.add(entry);
  let stopped = false;
  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    live.delete(entry);
    // SIGKILL rather than SIGTERM: ffmpeg writing into a pipe whose reader
    // has gone blocks in the write rather than reaching its signal handler,
    // so a polite stop can leave the process alive indefinitely.
    child.kill("SIGKILL");
  };
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk).trim();
    if (text) {
      // loglevel is already error-only, so anything arriving here is worth
      // seeing - a failed hardware init, an unreadable file.
      logger.log("warn", `ffmpeg (transcode): ${text}`);
    }
  });
  child.on("close", (code) => {
    // 255 is what SIGKILL looks like from ffmpeg's side, and is the normal
    // end of a stream someone stopped watching.
    if (code && code !== 255 && !stopped) {
      logger.log("warn", `Transcode of ${filePath} exited with code ${code}`);
    }
    stop();
  });
  child.on("error", (e) => {
    logger.log("warn", `Transcode of ${filePath} failed to start: ${e.message}`);
    stop();
  });
  return { process: child, stop };
};
