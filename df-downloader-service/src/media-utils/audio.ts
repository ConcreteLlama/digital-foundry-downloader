import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { describeExit, runCommand } from "../utils/command.js";

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
 * Decodes a media file's audio to a standalone file on disk.
 *
 * Streaming variants above suit APIs that accept a stream, but a local
 * transcriber is a subprocess that wants a real path it can seek around
 * (whisper.cpp in particular reads the whole file up front). Writing a
 * temporary WAV is cheap next to the transcription itself - a couple of
 * seconds for a feature-length video.
 */
export const fileToAudioFile = async (filename: string, outputPath: string, opts?: AudioStreamOpts) => {
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
  await runCommand(ffmpegPath, ffmpegArgs);
  return outputPath;
};
