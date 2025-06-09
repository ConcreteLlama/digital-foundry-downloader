import { logger, MediaFileMeta, SrtLine, SubtitleInfo } from "df-downloader-common";
import ffmpegPathImport from "ffmpeg-static";
import ffprobePathImport from "ffprobe-static";
import fs from "fs";
import _ from "lodash";
import { configService } from "../config/config.js";
import { generateSrt, languageToSubsLanguage, parseSrt } from "../media-utils/subtitles/srt-utils.js";
import { Chapter, makeChapterContent } from "./chatpers.js";
import { runCommand } from "./command.js";
import { fileExists, moveFile, setDateOnFile } from "./file-utils.js";
import { mediaSanitise } from "./string-utils.js";

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

export const injectMediaMetadata = async (mediaFilePath: string, meta: MediaFileMeta) => {
  const config = configService.config;
  logger.log("info", `Setting metadata for ${mediaFilePath}`);
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

    workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
    while (await fileExists(workingFilename)) {
      workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
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
      ffmpegArgs.push("-metadata", `synopsis=${mediaSanitise(description)}`);
      ffmpegArgs.push("-metadata", `description=${mediaSanitise(description)}`);
    }
    if (tags && tags.length > 0) {
      const tagListStr = tags.map((tag) => tag.replace(/:/g, "")).join(",");
      ffmpegArgs.push("-metadata", `genre=${tagListStr}`);
    }
    if (subtitles) {
      ffmpegArgs.push("-metadata:s:s:0", `language=${languageToSubsLanguage(subtitles.language)}`);
    }

    ffmpegArgs.push(workingFilename);

    logger.log("debug", `Metadata args for ${mediaFilePath}: ${ffmpegArgs}`);

    await runCommand(ffmpegPath, ffmpegArgs, subtitlesText).then(async () => {
      logger.log("debug", `Moving ${workingFilename} to ${mediaFilePath} after setting metadata`);
      await moveFile(workingFilename, mediaFilePath, {
        clobber: true,
      });
    });
    publishedDate && (await setDateOnFile(mediaFilePath, publishedDate));
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

type MediaFileMetaNoSubs = Omit<MediaFileMeta, 'subtitles'> & {
  subsLang?: string;
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
  logger.log("info", `Metadata args: ${ffprobeArgs}`);
  const metadataStr = await runCommand(ffprobePath, ffprobeArgs);
  console.log('Got meta: ', metadataStr);
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
  const subtitleStream = parsed.streams?.find((stream: any) => stream.codec_type === "subtitle");
  if (subtitleStream) {
    meta.subsLang = subtitleStream.tags.language;
  }
  return meta;
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
  delete baseMeta.subsLang;
  return {
    ...baseMeta,
    subtitles,
  };
}