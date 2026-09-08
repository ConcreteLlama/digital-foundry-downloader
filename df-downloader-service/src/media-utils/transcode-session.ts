import { ChildProcess, spawn } from "child_process";
import { ffmpegPath } from "../utils/ffmpeg-binary.js";
import { logger } from "df-downloader-common";
import { PlayerConfig } from "df-downloader-common/config/player-config.js";
import { ProbedAudioStream, ProbedVideoStream } from "../utils/media-metadata.js";


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
 * What the browser asking for this stream says it can decode.
 *
 * Sent by the player, which has already asked the question of the actual
 * `<video>` element it is going to use - so it is an answer about that
 * machine, not a guess from a list here. Absent for a client that does not
 * say (an older UI, or a direct request), and the conservative defaults above
 * are then used.
 *
 * Worth having because the alternative was re-encoding video nobody needed
 * re-encoded: an HEVC file with AC-3 audio has to be transcoded for its
 * sound, and without this the video was rebuilt alongside it even on a device
 * that plays HEVC natively - expensive, slower, and a generation of quality
 * lost to fix an audio track.
 */
export type ClientCodecs = {
  video?: string[];
  audio?: string[];
};

/*
 * An empty list from a client is not the same as no list at all. "I can play
 * nothing" is a real answer and has to mean it; only the absence of the field
 * falls back to the defaults.
 */
const playableVideo = (client?: ClientCodecs) => (client?.video ? new Set(client.video) : PASSTHROUGH_VIDEO);
const playableAudio = (client?: ClientCodecs) => (client?.audio ? new Set(client.audio) : PASSTHROUGH_AUDIO);

/**
 * What, if anything, has to be re-encoded for a browser.
 *
 * Decided from the file rather than from anything the client claims. The
 * browser's own opinion is what chooses this route in the first place; once
 * here, what the file actually contains is the better authority, and it keeps
 * a hand-crafted request from asking the machine to encode something for no
 * reason.
 */
export const planTranscode = (
  video?: ProbedVideoStream,
  audio?: ProbedAudioStream,
  /*
   * Forces both, for exercising the video path deliberately.
   *
   * Worth having because that path is otherwise unreachable on a library of
   * H.264 files: the plan is decided from what the file contains, so no
   * amount of clicking will make it encode a video it can copy. Testing it by
   * editing the passthrough list means a rebuild to try and another to undo.
   */
  forceEncode = false,
  client?: ClientCodecs
): TranscodePlan => ({
  // Unknown counts as playable: an unrecognised codec that the browser is in
  // fact happy with should not cost a needless encode, and if it genuinely
  // cannot play it the element's error event still catches it.
  video: forceEncode || (video?.codecName && !playableVideo(client).has(video.codecName)) ? "encode" : "copy",
  audio: forceEncode || (audio?.codecName && !playableAudio(client).has(audio.codecName)) ? "encode" : "copy",
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
/**
 * How long a stream may produce nothing before it is assumed abandoned.
 *
 * Generous on purpose. A paused viewer stops reading, ffmpeg fills the pipe
 * and then blocks on the write, so no bytes flow - which is indistinguishable
 * from a tab left open in another window. Five minutes is longer than any
 * pause someone is coming back from quickly, and short enough that a
 * forgotten tab does not hold a slot all evening.
 *
 * Only reclaims a slot; it does not fix a viewer who returns to a dead
 * stream, who gets an error and can press play again.
 */
const IDLE_TIMEOUT_MS = 5 * 60_000;

/**
 * How long a stream gets before its speed is believed.
 *
 * ffmpeg's first progress blocks cover the startup - opening the file,
 * initialising the encoder, seeking - so they read far below realtime on a
 * stream that then runs fine. Warning on those would mean warning on
 * everything.
 */
const SLOW_GRACE_MS = 8000;

type LiveSession = {
  id: string;
  child: ChildProcess;
  lastActivity: number;
  startedAt: number;
  stop: () => void;
  /** The file being streamed, which is also how a viewer's own stream is found. */
  label: string;
  startSeconds: number;
  plan: TranscodePlan;
  /** Encoded seconds per second, as ffmpeg last reported it. */
  speed?: number;
};

let nextId = 1;

/** What is running, for the streams view and for answering "why is it busy". */
export type TranscodeStreamInfo = {
  id: string;
  file: string;
  startedAtIso: string;
  startSeconds: number;
  idleSeconds: number;
  video: "copy" | "encode";
  audio: "copy" | "encode";
};

export const listTranscodes = (): TranscodeStreamInfo[] => {
  prune();
  const now = Date.now();
  return [...live].map((entry) => ({
    id: entry.id,
    file: entry.label,
    startedAtIso: new Date(entry.startedAt).toISOString(),
    startSeconds: entry.startSeconds,
    idleSeconds: Math.round((now - entry.lastActivity) / 1000),
    video: entry.plan.video,
    audio: entry.plan.audio,
  }));
};

/** Stops one by id. False when it had already gone. */
export const stopTranscode = (id: string): boolean => {
  for (const entry of live) {
    if (entry.id === id) {
      logger.log("info", `Stopping transcode ${id} of ${entry.label} by request`);
      entry.stop();
      return true;
    }
  }
  return false;
};

const live = new Set<LiveSession>();

const prune = () => {
  const now = Date.now();
  for (const entry of live) {
    if (entry.child.exitCode !== null || entry.child.signalCode !== null || entry.child.killed) {
      live.delete(entry);
      continue;
    }
    /*
     * Nothing has been read from this in a long time, so nobody is watching.
     *
     * The socket staying open is not evidence of a viewer: a closed tab
     * usually drops it, but a machine that slept, a proxy holding the
     * connection, or simply a paused video all leave it open with ffmpeg
     * blocked on a write nobody drains. Without this those hold a slot until
     * the service restarts, which is how two of them made every later request
     * fail.
     */
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS) {
      logger.log("info", `Stopping an abandoned transcode of ${entry.label} - nothing read from it in five minutes`);
      entry.stop();
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
 * Whether this ffmpeg can actually encode with the GPU.
 *
 * Asked rather than assumed, because which ffmpeg is running is not fixed -
 * see utils/ffmpeg-binary.ts. The Docker image carries a build with the VAAPI
 * encoders in it; a bare checkout falls back to a portable one that has none,
 * where requesting a hardware encoder produced "Unknown encoder 'h264_vaapi'"
 * and killed the stream outright, on a machine whose GPU was perfectly
 * capable, with a setting that said "use it if it is there".
 *
 * Note this only reports that the encoder was compiled in. Whether it
 * initialises depends on the driver and on /dev/dri being passed through, and
 * that failure appears when the stream starts rather than here.
 *
 * Probed once and remembered. It is a property of the binary, which does not
 * change while the process runs.
 */
let vaapiSupport: Promise<Set<string>> | undefined;
const hardwareEncoders = (): Promise<Set<string>> => {
  vaapiSupport ??= new Promise<Set<string>>((resolve) => {
    const probe = spawn(ffmpegPath, ["-hide_banner", "-encoders"]);
    let out = "";
    probe.stdout?.on("data", (chunk) => (out += String(chunk)));
    probe.on("error", () => resolve(new Set()));
    probe.on("close", () => {
      const found = new Set(["h264_vaapi", "hevc_vaapi"].filter((name) => new RegExp(`\\b${name}\\b`).test(out)));
      logger.log(
        "info",
        found.size
          ? `ffmpeg at ${ffmpegPath} can encode video with the GPU (${[...found].join(", ")})`
          : `ffmpeg at ${ffmpegPath} has no GPU encoder built in, so any video re-encoding will use the processor`
      );
      resolve(found);
    });
  });
  return vaapiSupport;
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
/**
 * The picture to send, given the source and the ceiling in settings.
 *
 * Computed from the probed dimensions rather than left to a filter
 * expression: the numbers are already known here, and a concrete `w=1920:h=1080`
 * behaves the same on every ffmpeg build, where support for `-2` and for
 * expressions in the VAAPI scaler has varied between versions.
 *
 * Returns nothing when there is nothing to do - no probe, or a source already
 * within the ceiling - and the stream is then encoded at its own size.
 */
const MAX_HEIGHTS: Record<PlayerConfig["maxHeight"], number | undefined> = {
  source: undefined,
  "1440p": 1440,
  "1080p": 1080,
  "720p": 720,
};

const targetSize = (
  video: ProbedVideoStream | undefined,
  maxHeight: PlayerConfig["maxHeight"],
  requested?: number
) => {
  // An explicit choice from the player wins outright, in both directions: it
  // is a person looking at the picture, which beats a default written by
  // somebody who was not.
  const ceiling = requested ?? MAX_HEIGHTS[maxHeight];
  if (!ceiling || !video?.width || !video?.height || video.height <= ceiling) {
    return undefined;
  }
  // Even numbers on both axes: H.264 chroma is subsampled, and an odd
  // dimension is rejected outright by some encoders rather than rounded.
  const height = ceiling % 2 === 0 ? ceiling : ceiling - 1;
  const width = Math.round((video.width * height) / video.height / 2) * 2;
  return { width, height };
};

/**
 * What a re-encoded stream may spend, by picture size and codec.
 *
 * Rough figures picked to look right rather than to be optimal - this is a
 * stream nobody keeps, made once per viewing, and a number that is a little
 * generous costs bandwidth where one that is mean costs the picture.
 *
 * HEVC is given about 60% of H.264's for the same size, which is the usual
 * rule of thumb and the entire reason to prefer it when the device can decode
 * it: the same picture over a much thinner connection.
 */
const BITRATES: Record<string, { h264: string; hevc: string }> = {
  "2160": { h264: "16M", hevc: "10M" },
  "1440": { h264: "10M", hevc: "6M" },
  "1080": { h264: "8M", hevc: "5M" },
  "720": { h264: "4M", hevc: "2500k" },
};

const bitrateFor = (height: number | undefined, codec: "h264" | "hevc") => {
  const rungs = [2160, 1440, 1080, 720];
  // The smallest rung the picture still fits inside, so an odd size (an
  // ultrawide crop, a 1600-tall source) is funded like the rung above it
  // rather than falling off the table.
  const rung = rungs.reverse().find((value) => (height ?? 1080) <= value) ?? 2160;
  return BITRATES[String(rung)][codec];
};

/**
 * Per-request overrides, as opposed to the standing settings.
 *
 * A viewer choosing a smaller picture from the player is not changing what
 * the app does by default, so it arrives here rather than through config.
 */
export type TranscodeOptions = {
  /** An explicit ceiling from the player, which beats the configured one. */
  maxHeight?: number;
  /** Set when the client said it can decode HEVC, so it is worth targeting. */
  preferHevc?: boolean;
};

const buildArgs = (
  filePath: string,
  startSeconds: number,
  plan: TranscodePlan,
  config: PlayerConfig,
  encoders: Set<string>,
  video: ProbedVideoStream | undefined,
  options: TranscodeOptions
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
    /*
   * HEVC only when the client asked for it and the GPU can do it. There is no
   * software fallback: libx265 cannot encode anything like realtime on this
   * class of machine, so without the hardware encoder H.264 is the only
   * honest answer.
   */
  const codec: "h264" | "hevc" =
    options.preferHevc && encoders.has("hevc_vaapi") && config.hardwareAcceleration === "auto" ? "hevc" : "h264";
  const useHardware =
    plan.video === "encode" && config.hardwareAcceleration === "auto" && encoders.has(`${codec}_vaapi`);
  if (useHardware) {
    args.push("-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi");
  }
  args.push("-i", filePath);
  const size = plan.video === "encode" ? targetSize(video, config.maxHeight, options.maxHeight) : undefined;
  if (plan.video === "copy") {
    args.push("-c:v", "copy");
  } else if (useHardware) {
    // The scaler runs on the GPU, on frames that are already there - the
    // format conversion has to happen regardless, so resizing in the same
    // filter is close to free and saves the encoder most of its work.
    const scale = size ? `scale_vaapi=w=${size.width}:h=${size.height}:format=nv12` : "scale_vaapi=format=nv12";
    args.push("-vf", scale, "-c:v", `${codec}_vaapi`, "-b:v", bitrateFor(size?.height ?? video?.height, codec));
    if (codec === "hevc") {
      // hvc1 rather than ffmpeg's default hev1: Safari plays the first and
      // silently refuses the second, and every other browser accepts both.
      args.push("-tag:v", "hvc1");
    }
  } else {
    if (size) {
      args.push("-vf", `scale=${size.width}:${size.height}`);
    }
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
    /*
     * Machine-readable progress on stderr, which is the only channel free -
     * stdout is the video. It is what turns "it was a bit stuttery" into a
     * number: ffmpeg reports the ratio of encoded time to elapsed time, and
     * anything under 1x cannot keep up with someone watching, however healthy
     * the log otherwise looks.
     */
    "-progress", "pipe:2",
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
/*
 * Swept on a timer as well as on each request.
 *
 * Checking only when a new request arrives would leave an abandoned stream
 * running until somebody happened to want one - which on a personal install
 * could be days. Unref'd so it never holds the process open at shutdown.
 */
const sweep = setInterval(prune, 60_000);
sweep.unref?.();

export const startTranscode = async (
  filePath: string,
  startSeconds: number,
  plan: TranscodePlan,
  config: PlayerConfig,
  video?: ProbedVideoStream,
  options: TranscodeOptions = {}
): Promise<TranscodeSession | undefined> => {
  /*
   * A viewer seeking is not a second viewer.
   *
   * Every skip asks for a new stream, and the old one only goes away when its
   * socket closes - which can lag, or not happen at all if something went
   * wrong. So a single person scrubbing could reach the limit against nobody
   * but themselves, and then be told the machine was busy re-encoding videos
   * for other people who did not exist.
   *
   * An older stream of the same file is therefore replaced rather than
   * counted. One file, one viewer is not strictly true, but it is true on a
   * personal install, and the failure it prevents - being locked out of a
   * video by your own abandoned streams - is far more likely than two people
   * watching the same file at the same moment.
   */
  for (const entry of [...live]) {
    if (entry.label === filePath) {
      logger.log("debug", `Replacing an existing transcode of ${filePath} - the same file is being restarted`);
      entry.stop();
    }
  }
  const running = activeTranscodes();
  if (running >= config.maxConcurrentStreams) {
    logger.log(
      "warn",
      `Refusing a transcode of ${filePath} - ${running} already running: ${listTranscodes()
        .map((stream) => `${stream.file} (idle ${stream.idleSeconds}s)`)
        .join(", ")}`
    );
    return undefined;
  }
  // Only asked when it could matter - a copy never touches an encoder, and
  // probing on every audio-only stream would spawn a process to learn
  // something irrelevant.
  const encoders = plan.video === "encode" ? await hardwareEncoders() : new Set<string>();
  const args = buildArgs(filePath, startSeconds, plan, config, encoders, video, options);
  logger.log(
    "info",
    `Transcoding ${filePath} from ${Math.round(startSeconds)}s (video: ${plan.video}, audio: ${plan.audio}${
      plan.video === "encode" ? `, ${encoders.size ? "attempting the GPU" : "on the processor"}` : ""
    })`
  );
  logger.log("debug", `ffmpeg transcode args: ${args.join(" ")}`);
  const child = spawn(ffmpegPath, args);
  let stopped = false;
  const entry: LiveSession = {
    id: `stream-${nextId++}`,
    child,
    lastActivity: Date.now(),
    startedAt: Date.now(),
    label: filePath,
    startSeconds,
    plan,
    stop: () => stop(),
  };
  live.add(entry);
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
  /*
   * Bytes leaving for the client are the only honest sign a viewer is still
   * there. `data` fires as the pipe drains, which stops the moment nothing is
   * reading - see the idle sweep above.
   */
  child.stdout?.on("data", () => {
    entry.lastActivity = Date.now();
  });
  /*
   * Warn once, not every second. A stream that cannot keep up says so on
   * every progress block, and a warning per second for the length of a video
   * buries everything else in the log.
   */
  let warnedSlow = false;
  child.stderr?.on("data", (chunk) => {
    const raw = String(chunk);
    // Progress arrives as key=value blocks on the same channel as errors, so
    // it has to be taken out before the rest is treated as a problem.
    const lines = raw.split("\n");
    /*
     * Digits count. ffmpeg's progress keys include per-stream ones like
     * `stream_0_0_q=-1.0`, and a pattern of letters and underscores alone
     * missed every one of them - so they fell through to the error path and
     * filled the log with warnings about a stream that was working perfectly.
     */
    const isProgress = (line: string) => /^[a-z0-9_]+=/.test(line.trim());
    const progress = lines.filter(isProgress);
    const speed = progress
      .map((line) => line.trim().match(/^speed=\s*([\d.]+)x$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .pop();
    if (speed) {
      const rate = Number(speed[1]);
      entry.speed = rate;
      if (rate < 1 && !warnedSlow && Date.now() - entry.startedAt > SLOW_GRACE_MS) {
        warnedSlow = true;
        logger.log(
          "warn",
          `Re-encoding ${filePath} is running at ${rate}x, slower than playback - expect stuttering. ` +
            `A lower Max height under Player, or passing a graphics card into the container, is what fixes this`
        );
      }
    }
    /*
     * Only the progress lines are dropped, not the whole chunk. ffmpeg can
     * emit a real error in the same read as a progress block, and discarding
     * both would hide exactly the failures this handler exists to report.
     */
    const text = lines.filter((line) => !isProgress(line)).join("\n").trim();
    if (text) {
      // loglevel is already error-only, so anything arriving here is worth
      // seeing - a failed hardware init, an unreadable file.
      logger.log("warn", `ffmpeg (transcode): ${text}`);
      /*
       * Naming this case explicitly because it is the one that reads as a
       * broken video. The encoder being compiled in is all the probe can
       * tell you; whether it initialises depends on the driver and on
       * /dev/dri reaching the container, and when it does not, ffmpeg says
       * so in its own vocabulary and the stream simply dies.
       */
      if (/vaapi|drm|render|hwaccel|hwupload/i.test(text)) {
        logger.log(
          "warn",
          `That looks like the GPU failing to initialise rather than a problem with the file. Check /dev/dri is passed into the container, or set hardwareAcceleration to off under Player to use the processor instead`
        );
      }
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
