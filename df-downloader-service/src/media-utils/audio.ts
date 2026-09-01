import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { describeExit, runCommand } from "../utils/command.js";
import { FFMPEG_DURATION_LINE, FFMPEG_OUT_TIME_LINE } from "../utils/media-metadata.js";

export type AudioStreamOpts = {
  format?: string;
  aCodec?: string;
  channels?: number;
  sampleRate?: number;
};
export const fileToAudioStream = (filename: string, opts?: AudioStreamOpts) => {
  const { aCodec, format = "wav", channels, sampleRate } = opts || {};

  const ffmpegArgs: string[] = ["-i", filename];
  if (channels) {
    ffmpegArgs.push("-ac", channels.toString());
  }
  if (sampleRate) {
    ffmpegArgs.push("-ar", sampleRate.toString());
  }
  if (aCodec) {
    ffmpegArgs.push("-acodec", aCodec);
  }
  ffmpegArgs.push("-q:a", "0", "-map", "a", "-f", format, "-");

  const process = spawn(ffmpegPath, ffmpegArgs);
  const procPromise = new Promise<void>((res, rej) => {
    // As in runCommand: keep a bounded tail rather than the last chunk, and
    // survive a process that dies without printing anything.
    let stderr = "";
    process.on("error", (err) => {
      rej(err);
    });
    process.on("close", (code, signal) => {
      if (code === 0) {
        return res();
      }
      const detail = stderr.trim();
      rej(new Error(`${describeExit("ffmpeg", code, signal)}${detail ? `:
${detail}` : " without writing any output"}`));
    });
    process.stderr.on("data", (chunk) => (stderr = `${stderr}${chunk}`.slice(-4096)));
  });
  return {
    stdout: process.stdout,
    awaitStop: async (timeout: number) => {
      const killTimer = setTimeout(() => {
        process.kill();
      }, timeout);
      await procPromise;
      clearTimeout(killTimer);
    },
  };
};

export const fileToAudioBuffer = async (filename: string, opts?: AudioStreamOpts) => {
  const audioStream = fileToAudioStream(filename, opts);
  const chunks: Buffer[] = [];
  for await (const chunk of audioStream.stdout) {
    chunks.push(chunk);
  }
  await audioStream.awaitStop(10000);
  return Buffer.concat(chunks);
};

/**
 * Reports how far through the decode ffmpeg is.
 *
 * Deliberately its own parameter rather than a field on AudioStreamOpts:
 * those options are shared with the streaming variants above, which have no
 * caller that wants progress.
 */
export type AudioFileProgressOpts = {
  /**
   * Length of the source in seconds, which turns ffmpeg's elapsed output
   * time into a percentage. Callers generally have this already; when
   * omitted it is read from ffmpeg's own "Duration:" banner instead.
   */
  durationSeconds?: number | null;
  onProgress: (percent: number) => void;
};

/**
 * Decodes a media file's audio to a standalone file on disk.
 *
 * Streaming variants above suit APIs that accept a stream, but a local
 * transcriber is a subprocess that wants a real path it can seek around
 * (whisper.cpp in particular reads the whole file up front). Writing a
 * temporary WAV is cheap next to the transcription itself - a couple of
 * seconds for a feature-length video.
 */
export const fileToAudioFile = async (
  filename: string,
  outputPath: string,
  opts?: AudioStreamOpts,
  progressOpts?: AudioFileProgressOpts
) => {
  const { aCodec, channels, sampleRate } = opts || {};
  const ffmpegArgs: string[] = ["-y", "-i", filename];
  if (channels) {
    ffmpegArgs.push("-ac", channels.toString());
  }
  if (sampleRate) {
    ffmpegArgs.push("-ar", sampleRate.toString());
  }
  if (aCodec) {
    ffmpegArgs.push("-acodec", aCodec);
  }
  ffmpegArgs.push("-map", "a", outputPath);
  if (progressOpts) {
    // Global option, so it has to precede the inputs.
    ffmpegArgs.unshift("-progress", "pipe:1");
  }

  // Falls back to the input's own banner when the caller has no duration to
  // hand, so this stays usable on its own. Either way a missing duration
  // only costs the percentage, never the extraction.
  let totalSeconds = progressOpts?.durationSeconds || undefined;
  let lastPercent = -1;
  await runCommand(ffmpegPath, ffmpegArgs, undefined, {
    onStderr: (chunk) => {
      if (totalSeconds !== undefined) {
        return;
      }
      const match = chunk.match(FFMPEG_DURATION_LINE);
      if (match) {
        totalSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      }
    },
    onStdout: (chunk) => {
      if (!progressOpts || !totalSeconds) {
        return;
      }
      let outTimeUs: number | undefined;
      for (const match of chunk.matchAll(FFMPEG_OUT_TIME_LINE)) {
        outTimeUs = Number(match[1]);
      }
      if (outTimeUs === undefined) {
        return;
      }
      const percent = Math.min(100, Math.round((outTimeUs / 1_000_000 / totalSeconds) * 100));
      if (percent === lastPercent) {
        return;
      }
      lastPercent = percent;
      progressOpts.onProgress(percent);
    },
  });
  return outputPath;
};
