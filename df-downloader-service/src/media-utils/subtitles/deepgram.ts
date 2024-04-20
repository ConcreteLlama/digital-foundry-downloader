import deepgram from "@deepgram/sdk";
const Deepgram = deepgram.Deepgram;
import { DfContentInfo, logger, LanguageCode } from "df-downloader-common";
import { Utterance } from "@deepgram/sdk/dist/types/utterance.js";
import { PrerecordedTranscriptionResponse } from "@deepgram/sdk/dist/types/prerecordedTranscriptionResponse.js";
import { SubtitleGenerator, SubtitleInfo } from "./subtitles.js";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { fileToAudioStream } from "../audio.js";

const languageCodeToDeepgramCode = (language: LanguageCode) => {
  switch (language) {
    case "en":
      return "eng";
    default:
      return "eng";
  }
};

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
  readonly serviceType: SubtitlesService = "deepgram";
  private readonly deepgram;
  constructor(deepgramApiKey: string) {
    this.deepgram = new Deepgram(deepgramApiKey);
  }
  async getSubs(_dfContentInfo: DfContentInfo, filename: string, languageCode: LanguageCode): Promise<SubtitleInfo> {
    const language = languageCodeToDeepgramCode(languageCode);
    logger.log("info", `Generating ${language} subs using deepgram for ${filename}`);
    const wavAudioStream = fileToAudioStream(filename);
    try {
      const transcript = await this.deepgram.transcription.preRecorded(
        {
          stream: wavAudioStream.stdout,
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
        service: this.serviceType,
      };
    } catch (e) {
      logger.log("error", `Error generating subs using deepgram for ${filename}: ${e}`);
      await wavAudioStream.awaitStop(1000).catch((e) => {
        logger.log("error", `Error stopping audio stream for ${filename}: ${e}`);
      });
      throw e;
    }
  }
  destroy(): void {
    // Nothing to do
  }
}
