import { SubtitlesConfig, SubtitlesService } from "df-downloader-common/config/subtitles-config";
import { LanguageCode, SubtitleInfo } from "df-downloader-common";
import { DeepgramSubtitleGenerator } from "./deepgram.js";
import { serviceLocator } from "../../services/service-locator.js";
import { DfContentInfo, TaskProgress, logger } from "df-downloader-common";
import { configService } from "../../config/config.js";
import { GoogleSttSubtitlesGenerator } from "./google-stt.js";
import { WhisperSubtitleGenerator } from "./whisper.js";

export type GeneratedSubtitleInfo = SubtitleInfo & {
  service: SubtitlesService;
};

/**
 * Reports how far along generation is, for services that can tell.
 * Transcribing locally can take tens of minutes on a long video, so without
 * this the task sits at "running" with nothing to show for it.
 */
export type SubtitleProgressReporter = (progress: TaskProgress) => void;

/**
 * Audio pulled out of a video ahead of transcription.
 *
 * Its own type so the pipeline can hand it between steps without knowing
 * which generator produced it or what it contains.
 */
export type PreparedAudio = {
  audioPath: string;
  /** Probed once and reused, so both phases can report a percentage. */
  durationSeconds?: number | null;
};

export interface SubtitleGenerator {
  serviceType: SubtitlesService;
  /**
   * Pulls the audio out, for generators that work from a local file.
   *
   * Optional: only local transcription needs it - a service that uploads the
   * video or is handed a URL has nothing to prepare. Split out from getSubs so
   * it can be a pipeline step of its own, which matters for two reasons.
   * Extracting audio from a multi-gigabyte video is minutes of ffmpeg, and
   * doing it inside the transcription task meant holding the single local
   * models slot throughout - blocking an analysis behind work that never
   * needed a model. And a step that takes minutes should be visible as a step,
   * rather than as a caption inside a row that looks like it is transcribing.
   *
   * Callers that skip it still work: getSubs extracts for itself when it is
   * not handed anything.
   */
  prepareAudio?(
    dfContentInfo: DfContentInfo,
    filename: string,
    onProgress?: SubtitleProgressReporter,
    signal?: AbortSignal
  ): Promise<PreparedAudio>;
  getSubs(
    dfContentInfo: DfContentInfo,
    filename: string,
    language: LanguageCode | string,
    onProgress?: SubtitleProgressReporter,
    /**
     * Abort to stop generation part-way.
     *
     * Optional because not every generator can honour it - one that makes a
     * single HTTP request has nothing useful to interrupt. Whisper does: it
     * runs a subprocess for minutes, and before this there was no way to take
     * one back once it had started.
     */
    signal?: AbortSignal,
    /** Audio already extracted by a preceding step, if there was one. */
    prepared?: PreparedAudio
  ): Promise<GeneratedSubtitleInfo>;
  destroy(): void;
}

const setServiceConfig = (subtitleConfig?: SubtitlesConfig) => {
  serviceLocator.setSubtitleGenerators([]);
  if (!subtitleConfig) {
    return;
  }
  const { services } = subtitleConfig;
  if (services?.deepgram) {
    serviceLocator.addSubtitleGenerator(new DeepgramSubtitleGenerator(services.deepgram.apiKey));
  }
  if (services?.google_stt) {
    serviceLocator.addSubtitleGenerator(new GoogleSttSubtitlesGenerator(services.google_stt.apiKey));
  }
  if (services?.whisper) {
    serviceLocator.addSubtitleGenerator(new WhisperSubtitleGenerator(services.whisper));
  }
};

export const loadSubtitlesService = () => {
  setServiceConfig(configService.config.subtitles);
  configService.on("configUpdated:subtitles", (event) => {
    const config = event?.newValue;
    setServiceConfig(config);
  });
};
