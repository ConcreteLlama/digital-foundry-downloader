import { SpeechClient } from "@google-cloud/speech";
import GoogleAuth from "google-auth-library";
import { SubtitleGenerator, SubtitleInfo } from "./subtitles.js";
import { DfContentInfo, LanguageCode, logger } from "df-downloader-common";
import { fileToAudioStream } from "../audio.js";
import { SrtLine, generateSrt, secondsToSrtTimestamp } from "./srt-utils.js";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";

export class GoogleSttSubtitlesGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "google_stt";
  private readonly client: SpeechClient;

  constructor(apiKey: string) {
    const auth = GoogleAuth.auth.fromAPIKey(apiKey);
    this.client = new SpeechClient({
      authClient: auth,
    });
  }
  destroy(): void {
    this.client.close();
  }

  async getSubs(_dfContentInfo: DfContentInfo, filename: string, language: LanguageCode): Promise<SubtitleInfo> {
    return new Promise((resolve, reject) => {
      logger.log("info", `Generating ${language} subs using Google STT for ${filename}`);
      const audioStream = fileToAudioStream(filename, {
        format: "s16le",
        sampleRate: 16000,
        channels: 1,
        aCodec: "pcm_s16le",
      });
      const stream = this.client.streamingRecognize({
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: 16000,
          languageCode: language,
          enableWordTimeOffsets: true,
        },
      });
      const subWords: StreamingRecognizeWord[] = [];
      audioStream.stdout.pipe(stream);
      stream.on("data", (data) => {
        const streamingRecognizeData = data as StreamingRecognizeData;
        for (const result of streamingRecognizeData.results) {
          if (!result.alternatives) {
            continue;
          }
          for (const alternative of result.alternatives) {
            if (!alternative.words?.length) {
              continue;
            }
            subWords.push(...alternative.words);
          }
        }
      });
      stream.on("error", (error) => {
        logger.log("error", `Error in STT response for ${filename}: ${error}`);
        reject(error);
        stream.end();
      });
      stream.on("end", () => {
        logger.log("info", `Finished STT for ${filename}`);
        const srtLines = wordsToSrtLines(subWords, 10, 5);
        const toReturn = {
          srt: generateSrt(srtLines),
          language,
        };
        resolve(toReturn);
      });
    });
  }
}

type StreamingRecognizeWord = {
  startTime: { seconds: string; nanos: number };
  endTime: { seconds: string; nanos: number };
  word: string;
  confidence: number;
  speakerTag: number;
  speakerLabel: string;
};

type StreaingRecognizeResult = {
  alternatives: {
    words: StreamingRecognizeWord[];
    transcript: string;
    confidence: number;
  }[];
  isFinal: boolean;
  stability: number;
  resultEndTime: { seconds: string; nanos: number };
  channelTag: number;
  languageCode: string;
};

type StreamingRecognizeData = {
  results: StreaingRecognizeResult[];
  error: null;
  speechEventType: string;
  totalBilledTime: { seconds: string; nanos: number };
  speechEventTime: { seconds: string; nanos: number };
  speechAdaptationInfo: null;
  requestId: string;
};

export const wordsToSrtLines = (
  words: StreamingRecognizeWord[],
  maxWordsPerSub: number,
  maxTimeAfterLineSeconds: number
) => {
  const subs: SrtLine[] = [];
  let currentSub: string[] = [];
  let currentSubStartTime = 0;
  let currentSubEndTime = 0;
  words.forEach(({ word, startTime, endTime }, index) => {
    const wordStartTime = parseInt(startTime.seconds) + startTime.nanos / 1e9;
    const wordEndTime = parseInt(endTime.seconds) + endTime.nanos / 1e9;
    if (currentSub.length === 0) {
      currentSubStartTime = wordStartTime;
      currentSub.push(word);
      currentSubEndTime = wordEndTime;
      return;
    }
    if (
      wordStartTime - currentSubEndTime > maxTimeAfterLineSeconds ||
      currentSub.length >= maxWordsPerSub ||
      index === words.length - 1
    ) {
      subs.push({
        start: secondsToSrtTimestamp(currentSubStartTime),
        end: secondsToSrtTimestamp(currentSubEndTime),
        transcript: currentSub.join(" "),
      });
      currentSub = [word];
      currentSubStartTime = wordStartTime;
      currentSubEndTime = wordEndTime;
      return;
    }
    currentSub.push(word);
    currentSubEndTime = wordEndTime;
  });
  return subs;
};
