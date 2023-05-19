import deepgram from "@deepgram/sdk";
const Deepgram = deepgram.Deepgram;
import { parseArgsStringToArgv } from "string-argv";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";
import { logger } from "df-downloader-common";
import { Utterance } from "@deepgram/sdk/dist/types/utterance.js";
import { PrerecordedTranscriptionResponse } from "@deepgram/sdk/dist/types/prerecordedTranscriptionResponse.js";
import { SubtitleGenerator, SubtitleInfo } from "./subtitles.js";

type Utt = {
  transcript: string;
  start: number;
  end: number;
};

const generateSrtLine = (idx: number, utt: Utt) => {
  const start = new Date(utt.start * 1000).toISOString().substring(11, 23).replace(".", ",");
  const end = new Date(utt.end * 1000).toISOString().substring(11, 23).replace(".", ",");
  return `${idx}\n${start} --> ${end}\n${utt.transcript}\n`;
};

const splutterance = (utterance: Utterance, maxWordsPerUtt: number): Utt[] => {
  if (utterance.words.length <= maxWordsPerUtt) {
    return [utterance];
  }
  let toReturn: Utt[] = [];
  const chunkSize = utterance.words.length / Math.ceil(utterance.words.length / maxWordsPerUtt);
  for (let i = 0; i < utterance.words.length; i += chunkSize) {
    const words = utterance.words.slice(i, i + chunkSize);
    toReturn.push({
      transcript: words.map((word) => word.punctuated_word || word.word).join(" "),
      start: words[0].start,
      end: words[words.length - 1].end,
    });
  }
  return toReturn;
};

const generateSrt = (transcript: PrerecordedTranscriptionResponse, maxWordsPerUtt: number) => {
  const utterances = transcript.results?.utterances;
  if (!utterances) {
    return "";
  }
  let srtLines: string[] = [];
  let idx = 1;
  for (const utterance of utterances) {
    const split = splutterance(utterance, maxWordsPerUtt);
    split.forEach((utt) => srtLines.push(generateSrtLine(idx++, utt)));
  }
  return srtLines.join("\n");
};

export class DeepgramSubtitleGenerator implements SubtitleGenerator {
  private readonly deepgram;
  constructor(deepgramApiKey: string) {
    this.deepgram = new Deepgram(deepgramApiKey);
  }
  async getSubs(filename: string, language: string): Promise<SubtitleInfo> {
    logger.log("info", `Generating ${language} subs for ${filename}`);
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
        srt: generateSrt(transcript, 20),
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
  destroy(): void {
    // Nothing to do
  }
}
