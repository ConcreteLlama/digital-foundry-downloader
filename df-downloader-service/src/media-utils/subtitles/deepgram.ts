import deepgram from "@deepgram/sdk";
import { DfContentInfo, LanguageCode, logger, SrtLine } from "df-downloader-common";
import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { fileToAudioStream } from "../audio.js";
import { secondsToSrtTimestamp } from "./srt-utils.js";
import { GeneratedSubtitleInfo, SubtitleGenerator } from "./subtitles.js";
const Deepgram = deepgram.Deepgram;

// @deepgram/sdk only publicly exports its "." entrypoint (the Deepgram class
// itself, see its package.json "exports") - these response/utterance shapes
// aren't part of that public surface, so derive them structurally from the
// actual method's return type instead of reaching into its internal dist/
// files (which "exports" no longer permits resolving into).
type PrerecordedTranscriptionResponse = Awaited<ReturnType<InstanceType<typeof Deepgram>["transcription"]["preRecorded"]>>;
type Utterance = NonNullable<NonNullable<PrerecordedTranscriptionResponse["results"]>["utterances"]>[number];

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

const generateSrtLine = (utt: Utt): SrtLine => {
  return {
    start: secondsToSrtTimestamp(utt.start),
    end: secondsToSrtTimestamp(utt.end),
    transcript: utt.transcript,
  }
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
    return [];
  }
  let srtLines: SrtLine[] = [];
  for (const utterance of utterances) {
    const split = splutterance(utterance, maxWordsPerUtt);
    split.forEach((utt) => srtLines.push(generateSrtLine(utt)));
  }
  return srtLines;
};

export class DeepgramSubtitleGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "deepgram";
  private readonly deepgram;
  constructor(deepgramApiKey: string) {
    this.deepgram = new Deepgram(deepgramApiKey);
  }
  async getSubs(_dfContentInfo: DfContentInfo, filename: string, languageCode: LanguageCode): Promise<GeneratedSubtitleInfo> {
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
        lines: generateSrt(transcript, 20),
        language: "en",
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
