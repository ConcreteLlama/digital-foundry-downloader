import deepgram from "@deepgram/sdk";
const Deepgram = deepgram.Deepgram;
import { parseArgsStringToArgv } from "string-argv";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { config } from "../config/config.js";
import { LogLevel } from "../logger.js";

const logger = config.logger;

export type SubtitleInfo = {
  srt: string;
  language: string;
};

export class SubtitleGenerator {
  private readonly deepgram;
  constructor(deepgramApiKey: string) {
    this.deepgram = new Deepgram(deepgramApiKey);
  }
  async getSubs(filename: string, language: string): Promise<SubtitleInfo> {
    logger.log(LogLevel.INFO, `Generating ${language} subs for ${filename}`);
    const ffmpegArgs = parseArgsStringToArgv(`-i "${filename}" -q:a 0 -map a -f wav -`);
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
    try {
      const transcript = await this.deepgram.transcription.preRecorded(
        {
          stream: process.stdout,
          mimetype: "audio/x-wav",
        },
        {
          utterances: true,
          numbers: true,
          punctuate: true,
          smart_format: true,
          language: "en",
          model: "video",
        }
      );
      return {
        srt: transcript.toSRT(),
        language,
      };
    } catch (e) {
      const timeout = setTimeout(() => {
        process.kill();
      }, 1000);
      await procPromise;
      clearTimeout(timeout);
      throw e;
    }
  }
}
