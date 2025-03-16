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

type PipeEntry = {
  pipeIndex: number;
  pipeContent: string;
}

export const injectMediaMetadata = async (mediaFilePath: string, meta: MediaMeta) => {
  const config = configService.config;
  logger.log("info", `Setting metadata for ${mediaFilePath}`);
  logger.log("debug", `Metadata: ${JSON.stringify(meta)}`);

  let workingFilename: string = '';

  let currentPipeIndex = 0;
  const pipeEntries: PipeEntry[] = [];

  try {
    const { title, publishedDate, description, synopsis, tags, chapters } = meta;
    const subtitles = meta.subtitles; 

    const ffmpegArgs: string[] = [];
    const addPipeEntry = (content: string) => {
      const pipeIndex = currentPipeIndex++;
      ffmpegArgs.push('-i', `pipe:${pipeIndex}`);
      pipeEntries.push({
        pipeIndex,
        pipeContent: content,
      });
      return pipeIndex;
    }

    workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
    while (await fileExists(workingFilename)) {
      workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
    }
    const chapterContent = makeChapterContent(chapters);
    ffmpegArgs.push("-i", mediaFilePath);
    if (subtitles) {
      addPipeEntry(subtitles.srt);
    }
    if (chapterContent) {
      addPipeEntry(chapterContent);
      ffmpegArgs.push("-map_metadata", "0");
    }
    ffmpegArgs.push("-codec", "copy");
    if (subtitles) {
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
      for (const { pipeIndex, pipeContent } of pipeEntries) {
        process.stdin.write(pipeContent, "utf8", (err) => {
          if (err) {
            logger.log("error", `Error writing to pipe ${pipeIndex}:`, err);
            rej(err);
          }
        });
      }
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
  }
};