import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

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
    let lastErr: any;
    process.on("error", (err) => {
      rej(err);
    });
    process.on("close", (rc) => {
      if (rc !== 0) {
        rej(lastErr.toString());
      }
      res();
    });
    process.stderr.on("data", (chunk) => (lastErr = chunk));
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
