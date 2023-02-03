import got, { Headers, OptionsInit, Progress, Request, Response } from "got";
import fs from "node:fs";
import stream from "node:stream";
import { promisify } from "node:util";
import prettyBytes from "pretty-bytes";
import { Logger, LogLevel } from "./logger.js";

const pipeline = promisify(stream.pipeline);
const truncate = promisify(fs.truncate);

const progressReportInterval = 1000;

export type DownloadProgressReport = {
  totalBytesDownloaded: number;
  totalBytes: number;
  retries: number;
  percentComplete: number;
  bytesPerSecond: number;
  startTime: Date;
  durationMillis: number;
  averageBytesPerSecond: number;
};

class DownloadProgress {
  currentAttemptBytesDownloaded: number = 0;
  currentAttemptBaseBytes: number = 0;

  totalBytesDownloaded: number = 0;
  totalBytes: number = 0;
  retries: number = 0;

  startTime: Date = new Date();

  lastReportTime: Date = new Date();
  lastReportBytes: number = 0;

  generateProgressReport(): DownloadProgressReport {
    const now = new Date();
    const durationMillis = now.getTime() - this.startTime.getTime();
    const averageBytesPerSecond = this.calculateBytesPerSecond(this.totalBytes, durationMillis);
    const toReturn = {
      totalBytesDownloaded: this.totalBytesDownloaded,
      totalBytes: this.totalBytes,
      retries: this.retries,
      percentComplete: this.getPercent(),
      bytesPerSecond: this.getBytesPerSecond(),
      startTime: this.startTime,
      durationMillis,
      averageBytesPerSecond,
    };
    this.lastReportTime = new Date();
    this.lastReportBytes = this.totalBytesDownloaded;
    return toReturn;
  }

  update(progress: Progress, at?: Date) {
    if (this.totalBytes === 0) {
      this.totalBytes = progress.total || 0;
    }
    this.currentAttemptBytesDownloaded = progress.transferred;
    const currentDownlodedBytes = this.currentAttemptBytesDownloaded + this.currentAttemptBaseBytes;
    this.totalBytesDownloaded = currentDownlodedBytes;
  }

  retryAttempt() {
    this.retries++;
    this.currentAttemptBaseBytes += this.currentAttemptBytesDownloaded;
    this.currentAttemptBytesDownloaded = 0;
  }

  getPercent() {
    return this.totalBytesDownloaded / (this.totalBytes || 999999999999);
  }

  getBytesPerSecond() {
    const bytesSinceLastUpdate = this.totalBytesDownloaded - this.lastReportBytes;
    const timeSinceLastUpdate = new Date().getTime() - this.lastReportTime.getTime();
    return this.calculateBytesPerSecond(bytesSinceLastUpdate, timeSinceLastUpdate);
  }

  calculateBytesPerSecond(bytes: number, timeMillis: number) {
    if (timeMillis === 0) {
      return 0;
    }
    return (bytes / timeMillis) * 1000;
  }
}

export type ProgressListener = (progress: DownloadProgressReport) => void;

export type DownloadOptions = {
  headers?: Headers;
  progressListener?: ProgressListener;
  maxResumeAttempts?: number;
};

export class DownloadInstance {
  private currentWriteStream?: fs.WriteStream;
  private headers: Headers;
  private progressListener?: ProgressListener;
  private maxResumeAttempts: number;
  private currentProgress: DownloadProgress = new DownloadProgress();

  constructor(
    private logger: Logger,
    private url: string,
    private destination: string,
    private downloadOptions: DownloadOptions
  ) {
    this.headers = downloadOptions.headers ? downloadOptions.headers : {};
    this.progressListener = downloadOptions.progressListener;
    this.maxResumeAttempts = downloadOptions.maxResumeAttempts || 20;
  }

  async download() {
    await this.downloadInternal();
  }

  private async downloadInternal(request?: Request) {
    return new Promise(async (resolve, reject) => {
      const stream =
        request ??
        got.stream(this.url, {
          headers: {
            ...this.headers,
          },
          retry: {
            limit: this.maxResumeAttempts,
          },
        });
      stream.on("response", (res: Response) => {
        this.logger.log(LogLevel.DEBUG, `Got response ${res.statusCode} ${JSON.stringify(res.headers)}`);
      });
      let lastProgressTime = 0;
      stream.on("downloadProgress", (progress: Progress) => {
        const now = new Date();
        this.currentProgress.update(progress);
        if (now.getTime() - lastProgressTime > progressReportInterval) {
          const progressReport = this.currentProgress.generateProgressReport();
          if (this.progressListener) {
            this.progressListener(progressReport);
          }
          lastProgressTime = now.getTime();
          this.logger.log(
            LogLevel.DEBUG,
            `Download progress for ${this.url}: ${downloadProgressToString(progressReport)}`
          );
        }
      });
      stream.once(
        "retry",
        (retryCount: number, error: any, createRetryStream: (updatedOptions?: OptionsInit) => Request) => {
          this.currentProgress.retryAttempt();
          this.logger.log(
            LogLevel.INFO,
            `Download retry for ${this.url}. ${downloadProgressToString(this.currentProgress.generateProgressReport())}`
          );
          this.downloadInternal(
            createRetryStream({
              headers: {
                ...this.headers,
                Range: `bytes=${this.currentProgress.currentAttemptBaseBytes}-`,
              },
            })
          )
            .then((value: any) => {
              resolve(value);
            })
            .catch((e: any) => {
              reject(e);
            });
        }
      );
      stream.on("error", (e: any) => {
        reject(e);
        this.logger.log(LogLevel.ERROR, `Download of ${this.url} to ${this.destination} failed:`, e);
      });
      stream.on("end", (e: any) => {
        resolve(this.destination);
        this.logger.log(LogLevel.INFO, `Download of ${this.url} to ${this.destination} succeeded`);
      });
      if (this.currentWriteStream) {
        this.currentWriteStream.destroy();
        await truncate(this.destination, this.currentProgress.currentAttemptBaseBytes);
        this.currentWriteStream = fs.createWriteStream(this.destination, {
          start: this.currentProgress.currentAttemptBaseBytes,
          flags: "r+",
        });
      } else {
        this.currentWriteStream = fs.createWriteStream(this.destination);
      }
      await pipeline(stream, this.currentWriteStream).catch((e) => {});
    });
  }
}

export async function download(logger: Logger, url: string, destination: string, downloadOptions: DownloadOptions) {
  const downloadInstance = new DownloadInstance(logger, url, destination, downloadOptions);
  return await downloadInstance.download();
}

export function downloadProgressToString(downloadProgress: DownloadProgressReport) {
  return (
    `${(downloadProgress.percentComplete * 100).toFixed(2)}% (${prettyBytes(
      downloadProgress.totalBytesDownloaded
    )} / ${prettyBytes(downloadProgress.totalBytes)})` +
    ` ${prettyBytes(downloadProgress.bytesPerSecond)} per second${
      downloadProgress.retries > 0 ? ` with ${downloadProgress.retries} retries` : ""
    }`
  );
}
