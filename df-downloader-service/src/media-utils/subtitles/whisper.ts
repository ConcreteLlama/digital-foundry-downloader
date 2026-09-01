import { DfContentInfo, LanguageCode, SrtLine, logger } from "df-downloader-common";
import { SubtitlesService, WhisperConfig, WhisperTermCorrection } from "df-downloader-common/config/subtitles-config.js";
import fs from "fs";
import os from "os";
import path from "path";
import _ from "lodash";
import { configDir, configService } from "../../config/config.js";
import { fileToAudioFile } from "../audio.js";
import { runCommand } from "../../utils/command.js";
import { fileExists } from "../../utils/file-utils.js";
import { probeMediaDurationSeconds } from "../../utils/media-metadata.js";
import { parseSrt } from "./srt-utils.js";
import { GeneratedSubtitleInfo, SubtitleGenerator, SubtitleProgressReporter } from "./subtitles.js";

/**
 * Where whisper.cpp publishes its GGML model files. Fetched on first use
 * rather than baked into the Docker image - they run from 75MB to ~3GB and
 * most installs will only ever want one of them.
 */
const MODEL_BASE_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/** Whisper is trained on 16kHz mono audio; anything else gets resampled internally anyway. */
const WHISPER_SAMPLE_RATE = 16000;
const WHISPER_CHANNELS = 1;

/**
 * whisper.cpp emits bracketed markers for stretches it decided weren't
 * speech. `[BLANK_AUDIO]` in particular is pure noise as a subtitle - it
 * routinely lands on the trailing silence of a video and would display as
 * an on-screen caption saying nothing happened. Descriptive parenthesised
 * cues like "(upbeat music)" are deliberately *not* filtered: those are
 * legitimate SDH-style captions.
 */
const NON_SPEECH_MARKERS = /^\[(?:BLANK_AUDIO|SILENCE|NO SPEECH|INAUDIBLE)\]$/i;

/**
 * whisper.cpp's --print-progress output, e.g.
 * "whisper_print_progress_callback: progress =  40%". It only emits this when
 * asked, and it's the only way to tell how far into a transcription it is - a
 * two-hour episode otherwise sits silent for tens of minutes.
 */
/**
 * A transcribed segment as whisper.cpp prints it while it works, e.g.
 * "[00:04:12.340 --> 00:04:15.880]   and that is the difference".
 *
 * The end timestamp is how far into the audio it has got, which is the only
 * continuous progress signal available. --print-progress fires once per whole
 * percent of work but whisper.cpp emits it in 5% steps, so on a two-hour
 * episode the bar sits still for minutes at a time and looks hung. These
 * arrive every few seconds of audio instead.
 */
const SEGMENT_LINE = /\[(\d{2}):(\d{2}):(\d{2})\.\d{3}\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})\]/g;

const PROGRESS_LINE = /progress\s*=\s*(\d+)\s*%/g;

/** Seconds into the audio, from a segment line's end timestamp. */
const segmentEndSeconds = (chunk: string): number | undefined => {
  let seconds: number | undefined;
  for (const match of chunk.matchAll(SEGMENT_LINE)) {
    const [, , , , hours, minutes, secs, millis] = match;
    seconds = Number(hours) * 3600 + Number(minutes) * 60 + Number(secs) + Number(millis) / 1000;
  }
  return seconds;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Applies the configured find/replace list to a transcript line.
 *
 * Whole-word by default, so a correction for "UA5" can't corrupt a longer
 * word that happens to contain it. Only falls back to a plain substring
 * match when the term starts or ends with a non-word character, where a
 * word boundary would never match.
 */
const applyTermCorrections = (text: string, corrections: WhisperTermCorrection[]) => {
  return corrections.reduce((toReturn, { from, to, caseInsensitive }) => {
    const escaped = escapeRegExp(from);
    const canUseWordBoundary = /^\w/.test(from) && /\w$/.test(from);
    const pattern = canUseWordBoundary ? `\\b${escaped}\\b` : escaped;
    return toReturn.replace(new RegExp(pattern, caseInsensitive ? "gi" : "g"), to);
  }, text);
};

/**
 * Defaults alongside config.yaml rather than in the work dir. The config
 * directory is always a persisted mount in the Docker setup, whereas the
 * work dir is scratch space - putting models there would re-download
 * hundreds of MB every time the container was recreated.
 */
const resolveModelDir = (config: WhisperConfig) => config.modelDir || path.join(configDir, "whisper-models");

/**
 * Downloads the model if it isn't already cached.
 *
 * Writes to a temporary name and renames on success, so an interrupted
 * download can't leave a truncated file that looks cached and then fails
 * every subsequent run in a confusing way.
 */
const ensureModel = async (config: WhisperConfig): Promise<string> => {
  const modelDir = resolveModelDir(config);
  const modelPath = path.join(modelDir, `ggml-${config.model}.bin`);
  if (await fileExists(modelPath)) {
    return modelPath;
  }
  await fs.promises.mkdir(modelDir, { recursive: true });
  const url = `${MODEL_BASE_URL}/ggml-${config.model}.bin`;
  logger.log("info", `Downloading Whisper model ${config.model} (first use) from ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Whisper model ${config.model}: ${response.status} ${response.statusText}`);
  }
  const tempPath = `${modelPath}.${process.pid}.partial`;
  try {
    await fs.promises.writeFile(tempPath, response.body);
    await fs.promises.rename(tempPath, modelPath);
  } catch (e) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw e;
  }
  logger.log("info", `Whisper model ${config.model} downloaded to ${modelPath}`);
  return modelPath;
};

/**
 * How much of the bar audio extraction owns, with transcription taking the
 * rest.
 *
 * Measured rather than guessed: extraction ran 1.8s against a 31s
 * transcription for an 11-minute video, and 6.1s against 107s for a
 * 46-minute one - a steady ~5.5% either way. Rounded up to 10% because both
 * numbers came off an SSD with the model already in page cache, and the NAS
 * installs this typically runs on read a multi-gigabyte source far more
 * slowly than that.
 */
const EXTRACTION_PERCENT_SPAN = 10;

/** Maps whisper's own 0-100 onto the slice of the bar left after extraction. */
const toOverallPercent = (transcriptionPercent: number) =>
  EXTRACTION_PERCENT_SPAN + (transcriptionPercent / 100) * (100 - EXTRACTION_PERCENT_SPAN);

/**
 * Local speech-to-text via whisper.cpp.
 *
 * Transcribes the downloaded file itself, which has two consequences worth
 * knowing:
 * - The timings are the file's own, so nothing needs realigning. Anything
 *   sourced from YouTube describes a longer cut of the video than DF
 *   actually ship (see utils/youtube/sponsorship.ts, which still corrects
 *   chapters for exactly that reason); these describe what's on disk.
 * - It costs CPU time rather than money or an API key, and nothing about
 *   it can break because a third party changed their mind.
 */
export class WhisperSubtitleGenerator implements SubtitleGenerator {
  readonly serviceType: SubtitlesService = "whisper";
  constructor(private readonly config: WhisperConfig) {}

  private get binaryPath() {
    // The Docker image builds whisper.cpp and sets WHISPER_BINARY; outside
    // it, fall back to whatever's on PATH so a local build just works.
    return this.config.binaryPath || process.env.WHISPER_BINARY || "whisper-cli";
  }

  private get threads() {
    // Two below the core count by default - this usually runs on a NAS
    // that's also serving media, and pegging every core for the length of a
    // feature-length transcription is very noticeable.
    return this.config.threads ?? Math.max(1, os.cpus().length - 2);
  }

  /**
   * Runs whisper-cli, naming the model file if it fails.
   *
   * whisper.cpp says very little when it dies during model load - it prints
   * its parameter banner and stops - so the raw failure is indistinguishable
   * from a crash mid-transcription. A truncated or half-downloaded model is
   * a real possibility (they're hundreds of MB, fetched on first use), and
   * the file's size makes that obvious at a glance.
   */
  private async transcribe(
    args: string[],
    modelPath: string,
    onStderr: (chunk: string) => void,
    onStdout?: (chunk: string) => void
  ) {
    try {
      return await runCommand(this.binaryPath, args, undefined, { onStderr, onStdout });
    } catch (e) {
      const size = await fs.promises
        .stat(modelPath)
        .then((stat) => `${Math.round(stat.size / 1e6)}MB`)
        .catch(() => "unreadable");
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`${message}
(model ${modelPath}, ${size})`);
    }
  }

  async getSubs(
    dfContentInfo: DfContentInfo,
    filename: string,
    language: LanguageCode | string,
    onProgress?: SubtitleProgressReporter
  ): Promise<GeneratedSubtitleInfo> {
    const workDir = configService.config.contentManagement.workDir;
    const modelPath = await ensureModel(this.config);
    const jobId = _.uniqueId("whisper_");
    const audioPath = path.join(workDir, `${jobId}.wav`);
    // whisper.cpp appends its own ".srt" to whatever -of is given.
    const outputPrefix = path.join(workDir, jobId);
    const srtPath = `${outputPrefix}.srt`;
    try {
      /*
       * Duration turns both ffmpeg's elapsed output time and whisper's
       * segment timestamps into a percentage, so it is probed once here and
       * used by both phases. Probed from the source rather than assumed, and
       * failure is not fatal: without it extraction reports nothing and
       * transcription falls back to whisper's own 5% steps, which is what it
       * always did.
       */
      const durationSeconds = await probeMediaDurationSeconds(filename).catch(() => null);
      let lastPercent = -1;
      let lastDetail: string | undefined;
      /*
       * Never let the bar go backwards. The sources disagree by a few
       * percent - whisper counts work done, segments count audio covered -
       * and a bar that steps back reads as a fault. A changed detail is
       * always published though, even at an unchanged percent: the phase
       * labels below are the whole point, and the first two phases sit at
       * one number while they run.
       */
      const report = (percent: number, detail: string) => {
        const bounded = Math.max(0, Math.min(100, Math.round(percent)));
        if (!onProgress || (bounded <= lastPercent && detail === lastDetail)) {
          return;
        }
        lastPercent = Math.max(lastPercent, bounded);
        lastDetail = detail;
        onProgress({ percent: lastPercent, detail });
      };

      logger.log("info", `Extracting audio from ${filename} for transcription`);
      // Published before ffmpeg is even spawned rather than waiting on its
      // first progress block: opening a multi-gigabyte source is itself part
      // of the wait, and a fast extraction only emits two blocks anyway.
      report(0, "Extracting audio");
      await fileToAudioFile(
        filename,
        audioPath,
        {
          channels: WHISPER_CHANNELS,
          sampleRate: WHISPER_SAMPLE_RATE,
        },
        {
          durationSeconds,
          onProgress: (percent) => report((percent / 100) * EXTRACTION_PERCENT_SPAN, "Extracting audio"),
        }
      );
      const requestedLanguage = this.config.language || language;
      const args = [
        "-m", modelPath,
        "-f", audioPath,
        "-osrt",
        "-of", outputPrefix,
        "-t", String(this.threads),
        "-l", requestedLanguage === "auto" ? "auto" : String(requestedLanguage),
        // Progress is only emitted when asked for - see PROGRESS_LINE.
        "--print-progress",
      ];
      if (!this.config.useGpu) {
        // whisper.cpp tries a GPU by default when its build has one; -ng
        // keeps it on the CPU. See WhisperConfig.useGpu for why that's
        // sometimes the faster choice.
        args.push("-ng");
      }
      logger.log(
        "info",
        `Transcribing ${filename} with Whisper (${this.config.model}, ${this.threads} threads) - this can take a while for long content`
      );
      const startedAt = Date.now();
      const transcribeDetail = `${this.config.model}, ${this.threads} threads`;
      /*
       * Every transcription spawns a fresh one-shot process (see destroy()),
       * so the model loads from disk before whisper.cpp prints anything we
       * can parse - measured at ~1.5s for `base` warm, and far longer for a
       * multi-gigabyte model on a cold NAS disk. There is no way to tell when
       * that load finishes short of the first real progress line arriving, so
       * this deliberately moves the label rather than faking a number: the
       * point is that the text is fresh and honest the moment the phase
       * starts, instead of the previous phase's caption sitting there inert.
       */
      report(EXTRACTION_PERCENT_SPAN, `Loading ${this.config.model} model`);
      await this.transcribe(
        args,
        modelPath,
        (chunk) => {
          // A single chunk can carry several progress lines; only the most
          // recent one is meaningful.
          let percent: number | undefined;
          for (const match of chunk.matchAll(PROGRESS_LINE)) {
            percent = Number(match[1]);
          }
          if (percent !== undefined) {
            report(toOverallPercent(percent), transcribeDetail);
          }
        },
        (chunk) => {
          if (!durationSeconds) {
            return;
          }
          const seconds = segmentEndSeconds(chunk);
          if (seconds === undefined) {
            return;
          }
          // Capped below 100: the run is finished when the process exits and
          // the file exists, not when the last segment happens to land on the
          // end of the audio.
          report(toOverallPercent(Math.min(99, (seconds / durationSeconds) * 100)), transcribeDetail);
        }
      );
      logger.log("info", `Transcribed ${filename} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
      if (!(await fileExists(srtPath))) {
        throw new Error(`Whisper produced no subtitle output for ${filename}`);
      }
      const corrections = this.config.termCorrections || [];
      const lines: SrtLine[] = parseSrt(await fs.promises.readFile(srtPath, "utf-8"))
        .filter((line) => {
          const transcript = line.transcript.trim();
          return transcript.length > 0 && !NON_SPEECH_MARKERS.test(transcript);
        })
        .map((line) =>
          corrections.length
            ? { ...line, transcript: applyTermCorrections(line.transcript, corrections) }
            : line
        );
      return {
        lines,
        language: requestedLanguage === "auto" ? language : requestedLanguage,
        service: this.serviceType,
      };
    } finally {
      // Both are large (a WAV of a feature-length video runs to hundreds of
      // MB) and neither is any use once parsed.
      await fs.promises.rm(audioPath, { force: true }).catch(() => {});
      await fs.promises.rm(srtPath, { force: true }).catch(() => {});
    }
  }

  destroy(): void {
    // Nothing to do - whisper.cpp runs as a one-shot subprocess.
  }
}
