import { DfContent } from "./df-types.js";

import { exec } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { utimes } from "utimes";
import { Config } from "./config.js";
import { moveFile } from "./helper.js";
import { Logger, LogLevel } from "./logger.js";

let filenameIter = 0;

export class DfMetaInjector {
  readonly logger: Logger;
  constructor(private config: Config) {
    this.logger = config.logger;
  }

  setMeta(mpegFilePath: string, contentInfo: DfContent) {
    this.logger.log(LogLevel.INFO, `Setting metadata for ${mpegFilePath}`);
    const workingFilename = `${this.config.workDir}/ffmpeg_${filenameIter++}.mp4`;
    let ffmpegCommand = `${ffmpegPath} -i "${mpegFilePath}" -codec copy -metadata title="${this.sanitise(
      contentInfo.title
    )}"`;
    if (contentInfo.publishedDate) {
      ffmpegCommand += ` -metadata year=${contentInfo.publishedDate.getFullYear()}`;
    }
    if (contentInfo.description) {
      ffmpegCommand += ` -metadata synopsis="${this.sanitise(contentInfo.description)}"`;
      ffmpegCommand += ` -metadata description="${this.sanitise(contentInfo.description)}"`;
    }
    if (contentInfo.tags && contentInfo.tags.length > 0) {
      const tagListStr = contentInfo.tags.map((tag) => tag.replace(/:/g, "")).join(",");
      ffmpegCommand += ` -metadata genre="${tagListStr}"`;
    }
    ffmpegCommand = `${ffmpegCommand} "${workingFilename}"`;
    this.logger.log(LogLevel.DEBUG, `Metadata command for ${mpegFilePath}: ${ffmpegCommand}`);

    let err: any;
    return new Promise((resolve, reject) => {
      exec(ffmpegCommand, async (error, stdout, stderr) => {
        try {
          this.logger.log(LogLevel.DEBUG, `Metadata set complete`);
          if (error) {
            err = error;
            return;
          }
          await moveFile(workingFilename, mpegFilePath, {
            clobber: true,
          });
          this.logger.log(LogLevel.DEBUG, `Moved ${workingFilename} back to ${mpegFilePath}`);
        } catch (e) {
          this.logger.log(LogLevel.ERROR, e);
          err = e;
        } finally {
          if (err) {
            reject(err);
          } else {
            resolve("Done");
          }
        }
      });
    });
  }

  async setDate(filename: string, creationDate: Date) {
    try {
      const timestamp = creationDate.getTime();
      await utimes(filename, {
        btime: timestamp,
        mtime: timestamp,
        atime: timestamp,
      });
    } catch (e) {
      this.logger.log(LogLevel.ERROR, e);
    }
  }

  sanitise(data: string) {
    return data.replace(/\n/gi, " ").replace(/[^a-z0-9  ,\\.!\\-\\[\\]\\?]/gi, "");
  }
}
