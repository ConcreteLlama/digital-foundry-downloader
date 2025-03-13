import { spawn } from "child_process";
import { logger } from "df-downloader-common";
import ffmpegPathImport from "ffmpeg-static";
import _ from "lodash";
import { configService } from "../config/config.js";
import { languageToSubsLanguage } from "../media-utils/subtitles/srt-utils.js";
import { SubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { fileExists, moveFile, setDateOnFile } from "./file-utils.js";
import { Chapter, makeChapterContent } from "./chatpers.js";
import fs from "fs";
import { mediaSanitise } from "./string-utils.js";

if (!ffmpegPathImport) {
  throw new Error("FFmpeg path not found");
}
const ffmpegPath = ffmpegPathImport;

export type MediaMeta = {
  title?: string;
  publishedDate?: Date;
  description?: string;
  synopsis?: string;
  tags?: string[];
  subtitles?: SubtitleInfo | null;
  chapters?: Chapter[] | null;
};

export const injectMediaMetadata = async (mediaFilePath: string, meta: MediaMeta) => {
  const config = configService.config;
  logger.log("info", `Setting metadata for ${mediaFilePath}`);
  logger.log("debug", `Metadata: ${JSON.stringify(meta)}`);

  let workingFilename: string = '';
  let chapterFilePath: string | null = null;

  try {
    const { subtitles, title, publishedDate, description, synopsis, tags, chapters } = meta;

    const ffmpegArgs: string[] = [];

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
    if (subtitles) {
      ffmpegArgs.push("-i", "pipe:");
    }
    if (chapterFilePath && chapterFileContent) {
      await fs.promises
        .writeFile(chapterFilePath, chapterFileContent, { encoding: "utf-8" })
      ffmpegArgs.push("-i", chapterFilePath);
      ffmpegArgs.push("-map_metadata", "0");
    }
    ffmpegArgs.push("-codec", "copy");
    if (subtitles) {
      ffmpegArgs.push("-c:s", "mov_text");
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

    const process = spawn(ffmpegPath, ffmpegArgs);
    await new Promise<void>((res, rej) => {
      let lastErr: any;
      process.once("close", (rc) => {
        if (rc !== 0) {
          logger.log("error", `Error setting metadata:`, lastErr.toString());
          return rej(lastErr.toString());
        }
        logger.log("debug", `Metadata set for ${mediaFilePath}`);
        res();
      });
      process.once("error", (err) => {
        logger.log("error", `Error setting metadata:`, err);
        rej(err);
      });
      process.stderr.on("data", (chunk) => (lastErr = chunk));
      process.stdin.write(subtitles?.srt || "");
      process.stdin.end();
    }).then(async () => {
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