import { logger } from "df-downloader-common";
import { configService } from "../config/config.js";
import { SubtitleInfo } from "../media-utils/subtitles/subtitles.js";
import { spawn } from "child_process";
import ffmpegPathImport from "ffmpeg-static";
import { fileExists, moveFile, setDateOnFile } from "./file-utils.js";
import _ from "lodash";

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
  subtitles?: SubtitleInfo;
};

let filenameIter = 0;

export const injectMediaMetadata = async (mediaFilePath: string, meta: MediaMeta) => {
  const config = configService.config;
  logger.log("info", `Setting metadata for ${mediaFilePath}`);
  logger.log("debug", `Metadata: ${JSON.stringify(meta)}`);

  const { subtitles, title, publishedDate, description, synopsis, tags } = meta;

  const ffmpegArgs: string[] = [];

  let workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
  while (await fileExists(workingFilename)) {
    workingFilename = `${config.contentManagement.workDir}/${_.uniqueId("ffmpeg_")}.mp4`;
  }
  ffmpegArgs.push("-i", mediaFilePath);
  if (subtitles) {
    ffmpegArgs.push("-i", "pipe:");
  }
  ffmpegArgs.push("-codec", "copy");
  if (subtitles) {
    ffmpegArgs.push("-c:s", "mov_text");
  }
  if (title) {
    ffmpegArgs.push("-metadata", `title=${sanitise(title)}`);
  }
  if (publishedDate) {
    ffmpegArgs.push("-metadata", `year=${publishedDate.getFullYear()}`);
  }
  if (description) {
    ffmpegArgs.push("-metadata", `synopsis=${sanitise(description)}`);
    ffmpegArgs.push("-metadata", `description=${sanitise(description)}`);
  }
  if (tags && tags.length > 0) {
    const tagListStr = tags.map((tag) => tag.replace(/:/g, "")).join(",");
    ffmpegArgs.push("-metadata", `genre=${tagListStr}`);
  }
  if (subtitles) {
    ffmpegArgs.push("-metadata:s:s:0", `language=${subtitles.language}`);
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
};

const sanitise = (data: string) => {
  return data.replace(/\n/gi, " ").replace(/[^a-z0-9  ,\\.!\\-\\[\\]\\?]/gi, "");
};
