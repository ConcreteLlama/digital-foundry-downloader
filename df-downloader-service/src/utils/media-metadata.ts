import { logger, MediaFileMeta, SrtLine, SubtitleInfo, TaskProgress } from "df-downloader-common";
import ffmpegPathImport from "ffmpeg-static";
import ffprobePathImport from "ffprobe-static";
import fs from "fs";
import _ from "lodash";
import { configService } from "../config/config.js";
import { generateSrt, languageToSubsLanguage, parseSrt } from "../media-utils/subtitles/srt-utils.js";
import { Chapter, makeChapterContent } from "./chatpers.js";
import { runCommand } from "./command.js";
import { fileExists, moveFile, pathIsEqual, setDateOnFile, TEMP_FILE_PREFIX } from "./file-utils.js";
import path from "path";
import { mediaSanitise, mediaSanitiseMultiline } from "./string-utils.js";

if (!ffmpegPathImport) {
  throw new Error("FFmpeg path not found");
}
const ffmpegPath = ffmpegPathImport;

if (!ffprobePathImport) {
  throw new Error("FFprobe path not found");
}
const ffprobePath = ffprobePathImport.path;

// type PipeEntry = {
//   pipeIndex: number;
//   pipeContent: string;
// }

/**
 * ffmpeg reports the input's length on stderr as it opens it
 * ("Duration: 00:10:59.84, start: ..."), and with `-progress` reports how far
 * it has got on stdout as `out_time_ms=<microseconds>`. Together those give a
 * real percentage for what is otherwise a silent multi-minute remux of a
 * multi-gigabyte file.
 *
 * Note out_time_ms is microseconds despite the name - a long-standing ffmpeg
 * misnomer.
 */
const FFMPEG_DURATION_LINE = /Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/;
const FFMPEG_OUT_TIME_LINE = /out_time_ms=(\d+)/g;

export type InjectMediaMetadataOpts = {
  /**
   * Write the result here instead of back over `mediaFilePath`, and remove
   * the source afterwards - effectively folding the subsequent move into
   * this remux, which otherwise reads and writes the whole file a second
   * time (see ContentManagementConfig.writeDirectToDestination).
   *
   * The temporary file is created in the *destination's* directory rather
   * than the work directory, specifically so the final step is a
   * same-filesystem rename. That rename is atomic, so anything watching the
   * destination (Plex, Jellyfin) only ever sees the real filename once the
   * file is complete - which is the guarantee the work directory exists to
   * provide in the first place.
   */
  outputPath?: string;
  /** Reports remux progress - see FFMPEG_DURATION_LINE. */
  onProgress?: (progress: TaskProgress) => void;
};

export const injectMediaMetadata = async (
  mediaFilePath: string,
  meta: MediaFileMeta,
  opts: InjectMediaMetadataOpts = {}
) => {
  const config = configService.config;
  const finalPath = opts.outputPath || mediaFilePath;
  logger.log("info", `Setting metadata for ${mediaFilePath}${opts.outputPath ? ` (writing to ${opts.outputPath})` : ""}`);
  logger.log("silly", `Metadata: ${JSON.stringify(meta)}`);

  let workingFilename: string = '';
  let chapterFilePath: string | null = null;

  // let currentPipeIndex = 0;
  // const pipeEntries: PipeEntry[] = [];

  try {
    const { title, publishedDate, description, tags, chapters, subtitles } = meta;

    const ffmpegArgs: string[] = [];
    // const addPipeEntry = (content: string) => {
    //   const pipeIndex = currentPipeIndex++;
    //   ffmpegArgs.push('-i', `pipe:${pipeIndex}`);
    //   pipeEntries.push({
    //     pipeIndex,
    //     pipeContent: content,
    //   });
    //   return pipeIndex;
    // }

    // Build the output next to wherever it's going to end up, so the move
    // below is a same-filesystem rename.
    //
    // This matters just as much when updating a file in place (a metadata
    // refresh, or embedding subtitles into an existing download) as it does
    // for a fresh download. Remuxing into the work directory and moving the
    // result back means reading and writing the whole file twice, and - since
    // that move crosses filesystems - the original gets overwritten in place
    // over however many minutes the copy takes. Anything streaming that file
    // at the time is reading it as it's rewritten. Building alongside the
    // target instead makes the swap a rename: instantaneous, and readers see
    // either the old file or the new one, never a half-written one.
    const writeAlongsideTarget = Boolean(opts.outputPath) || config.contentManagement.writeDirectToDestination;
    const workingDir = writeAlongsideTarget ? path.dirname(finalPath) : config.contentManagement.workDir;
    await fs.promises.mkdir(workingDir, { recursive: true });
    // Dot-prefixed because this temp file can live in the destination
    // directory, which media servers are watching - Plex and Jellyfin both
    // skip dotfiles, so they won't try to index a half-written remux. The
    // .mp4 extension has to stay: ffmpeg picks its muxer from it.
    const makeWorkingName = () => path.join(workingDir, `${TEMP_FILE_PREFIX}${_.uniqueId("")}.mp4`);
    workingFilename = makeWorkingName();
    while (await fileExists(workingFilename)) {
      workingFilename = makeWorkingName();
    }
    const chapterFileContent = makeChapterContent(chapters);
    chapterFilePath = chapterFileContent ? `${config.contentManagement.workDir}/${_.uniqueId("chapters_")}.txt` : null;
    while (chapterFilePath && (await fileExists(chapterFilePath))) {
      chapterFilePath = `${config.contentManagement.workDir}/${_.uniqueId("chapters_")}.txt`;
    }
    ffmpegArgs.push("-i", mediaFilePath);
    const subtitlesText = subtitles ? generateSrt(subtitles.lines) : undefined;
    if (subtitlesText) {
      ffmpegArgs.push("-i", "pipe:");
    }
    if (chapterFilePath && chapterFileContent) {
      await fs.promises
        .writeFile(chapterFilePath, chapterFileContent, { encoding: "utf-8" })
      ffmpegArgs.push("-i", chapterFilePath);
      ffmpegArgs.push("-map_metadata", "0");
    }
    ffmpegArgs.push("-codec", "copy");
    if (subtitlesText) {
      ffmpegArgs.push("-c:s", "mov_text");
    } else {
      ffmpegArgs.push("-c:s", "copy");
    }
    if (title) {
      ffmpegArgs.push("-metadata", `title=${mediaSanitise(title)}`);
    }
    if (publishedDate) {
      ffmpegArgs.push("-metadata", `year=${publishedDate.getFullYear()}`);
    }
    if (description) {
      // Multiline: this is prose shown in a description panel, not a
      // single-line field - see mediaSanitiseMultiline.
      const sanitisedDescription = mediaSanitiseMultiline(description);
      ffmpegArgs.push("-metadata", `synopsis=${sanitisedDescription}`);
      ffmpegArgs.push("-metadata", `description=${sanitisedDescription}`);
    }
    if (tags && tags.length > 0) {
      const tagListStr = tags.map((tag) => tag.replace(/:/g, "")).join(",");
      ffmpegArgs.push("-metadata", `genre=${tagListStr}`);
    }
    if (subtitles) {
      ffmpegArgs.push("-metadata:s:s:0", `language=${languageToSubsLanguage(subtitles.language)}`);
    }

    ffmpegArgs.push(workingFilename);
    if (opts.onProgress) {
      // Global option, so it has to precede the inputs.
      ffmpegArgs.unshift("-progress", "pipe:1");
    }

    logger.log("debug", `Metadata args for ${mediaFilePath}: ${ffmpegArgs}`);

    let totalSeconds: number | undefined;
    let lastPercent = -1;
    await runCommand(ffmpegPath, ffmpegArgs, subtitlesText, {
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
        if (!opts.onProgress || !totalSeconds) {
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
        opts.onProgress({ percent, detail: "Embedding metadata" });
      },
    }).then(async () => {
      logger.log("debug", `Moving ${workingFilename} to ${finalPath} after setting metadata`);
      // moveFile rather than a bare rename: same directory either way, but it
      // handles clobbering an existing file consistently across platforms
      // (Windows rename fails when the target exists).
      await moveFile(workingFilename, finalPath, {
        clobber: true,
      });
    });
    publishedDate && (await setDateOnFile(finalPath, publishedDate));
    if (opts.outputPath && !pathIsEqual(mediaFilePath, finalPath)) {
      // Only now that the destination file is complete and in place - if
      // anything above threw, the source is still there to retry from.
      logger.log("debug", `Removing ${mediaFilePath} now the metadata-injected copy is at ${finalPath}`);
      await fs.promises.rm(mediaFilePath, { force: true });
    }
  } finally {
    if (workingFilename && fs.existsSync(workingFilename)) {
      fs.promises.rm(workingFilename).then(() => {
        logger.log("debug", `Deleted temporary file ${workingFilename}`);
      });
    }
    if (chapterFilePath && fs.existsSync(chapterFilePath)) {
      fs.promises.rm(chapterFilePath).then(() => {
        logger.log("debug", `Deleted temporary chapter file ${chapterFilePath}`);
      });
    }
  }

};

/**
 * The video stream as ffprobe describes it, for callers that need to know
 * what a player would be asked to decode. Reported alongside the metadata
 * rather than by a probe of its own so opening a file for playback costs
 * one ffprobe of a multi-gigabyte file, not two.
 */
export type ProbedVideoStream = {
  codecName: string;
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
};

/** One embedded subtitle stream, as ffprobe sees it. */
export type ProbedSubtitleStream = {
  /** ffmpeg's own stream index, which is what extraction addresses. */
  index: number;
  codecName?: string;
  language?: string;
  title?: string;
};

type MediaFileMetaNoSubs = Omit<MediaFileMeta, 'subtitles'> & {
  /**
   * Every subtitle stream in the file, not just the first.
   *
   * subsLang below records only that one and only its language, which is
   * enough to say "this file has subtitles" but not enough to extract them -
   * that needs the index, and choosing between them needs the rest.
   */
  subtitleStreams?: ProbedSubtitleStream[];
  subsLang?: string;
  /** See ProbedVideoStream. Stripped by extractMediaMeta - not part of MediaFileMeta. */
  videoStream?: ProbedVideoStream;
  /** Measured container duration in seconds. Stripped by extractMediaMeta, as above. */
  durationSeconds?: number;
};
export const extractBaseMetadata = async (mediaFilePath: string, includeChapters: boolean = true): Promise<MediaFileMetaNoSubs> => {
  const ffprobeArgs = [
    "-i",
    mediaFilePath,
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
  ]
  if (includeChapters) {
    ffprobeArgs.push("-show_chapters");
  }
  ffprobeArgs.push("-show_streams");
  logger.log("info", `Extracting metadata for ${mediaFilePath}`);
  const metadataStr = await runCommand(ffprobePath, ffprobeArgs);
  const parsed = JSON.parse(metadataStr);
  const meta: MediaFileMetaNoSubs = {};
  if (parsed.format) {
    const parsedTags = parsed.format.tags;
    if (parsedTags) {
      meta.title = parsedTags.title;
      meta.description = parsedTags.description;
      meta.tags = parsedTags.genre?.split(",").map((tag: string) => tag.trim());
    }
  }
  if (parsed.chapters) {
    meta.chapters = parsed.chapters.map((chapter: any): Chapter => ({
      title: chapter.tags.title,
      start: chapter.start,
      end: chapter.end,
    }));
  }
  const subtitleStreams = (parsed.streams ?? []).filter((stream: any) => stream.codec_type === "subtitle");
  if (subtitleStreams.length) {
    // Tags are absent altogether on plenty of streams, so nothing here may
    // assume them - reading .language off a missing tags object was a crash
    // waiting for the first untagged file.
    meta.subsLang = subtitleStreams[0].tags?.language;
    meta.subtitleStreams = subtitleStreams.map((stream: any): ProbedSubtitleStream => ({
      index: stream.index,
      codecName: stream.codec_name,
      language: stream.tags?.language,
      title: stream.tags?.title,
    }));
  }
  const videoStream = parsed.streams?.find((stream: any) => stream.codec_type === "video");
  if (videoStream) {
    meta.videoStream = {
      codecName: videoStream.codec_name,
      profile: videoStream.profile,
      level: typeof videoStream.level === "number" ? videoStream.level : undefined,
      width: videoStream.width,
      height: videoStream.height,
    };
  }
  const duration = parseFloat(parsed.format?.duration);
  if (isFinite(duration) && duration > 0) {
    meta.durationSeconds = duration;
  }
  return meta;
};

/**
 * Measures a downloaded file's real duration with ffprobe.
 *
 * This is the authoritative answer to "how long is this video", and it has
 * to come from the file itself: Digital Foundry's own listing stopped
 * carrying a duration when the site relaunched, so the value we hold
 * otherwise is backfilled from YouTube - whose copy still contains the
 * sponsorship segment DF cut out of the download. Comparing the two is what
 * lets us realign YouTube-sourced chapters and subtitles onto the file (see
 * utils/youtube/sponsorship.ts), and that comparison is meaningless unless
 * this side of it is a genuine measurement.
 */
export const probeMediaDurationSeconds = async (mediaFilePath: string): Promise<number | null> => {
  const ffprobeArgs = [
    "-i",
    mediaFilePath,
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
  ];
  logger.log("info", `Measuring duration for ${mediaFilePath}`);
  const metadataStr = await runCommand(ffprobePath, ffprobeArgs);
  const duration = parseFloat(JSON.parse(metadataStr)?.format?.duration);
  if (!isFinite(duration) || duration <= 0) {
    logger.log("warn", `ffprobe reported no usable duration for ${mediaFilePath}`);
    return null;
  }
  return duration;
};

export const extractMediaSubtitles = async (mediaFilePath: string): Promise<SrtLine[]> => {
  const ffmpegArgs = [
    "-i",
    mediaFilePath,
    "-map",
    "0:s:0",
    "-f",
    "srt",
    "-"
  ];
  logger.log("info", `Extracting subtitles for ${mediaFilePath}`);
  logger.log("info", `Subtitles args: ${ffmpegArgs}`);
  const subtitlesStr = await runCommand(ffmpegPath, ffmpegArgs);
  return parseSrt(subtitlesStr);
}

export type ExtractMediaMetaOpts = {
  includeSubs: boolean;
  includeChapters: boolean;
}
export const extractMediaMeta = async(mediaFilePath: string, opts: ExtractMediaMetaOpts): Promise<MediaFileMeta> => {
  const { includeSubs, includeChapters } = opts;
  const baseMeta = await extractBaseMetadata(mediaFilePath, includeChapters);
  let subtitles: SubtitleInfo | undefined;
  if (includeSubs) {
    const srtLines = await extractMediaSubtitles(mediaFilePath).catch((e) => {
      logger.log("warn", `Failed to extract subtitles for ${mediaFilePath}: ${e}`);
      return undefined;
    });
    if (srtLines) {
      subtitles = {
        language: baseMeta.subsLang || "en",
        lines: srtLines,
      };
    }
  }
  // These three are extras for callers that want the probe's own view of the
  // file (see ProbedVideoStream); MediaFileMeta is the metadata-injection
  // shape and must not gain fields that would be written back into a file.
  delete baseMeta.subsLang;
  delete baseMeta.videoStream;
  delete baseMeta.durationSeconds;
  return {
    ...baseMeta,
    subtitles,
  };
}