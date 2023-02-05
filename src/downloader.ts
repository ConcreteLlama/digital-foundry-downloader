import got, { GotStream, Headers, OptionsInit, Progress, Request, Response } from "got";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import stream from "node:stream";
import { promisify } from "node:util";
import prettyBytes from "pretty-bytes";
import { config } from "./config/config.js";
import { Logger, LogLevel } from "./logger.js";

const pipeline = promisify(stream.pipeline);

// TODO:
// 1. Currently retries apply to each part download when using multi connection downloader (maybe this is OK)
// 2. Download stats go above 100% completion if retries have occurred
// 3. Pause currently does nothing; the got stream .pause() function seems to have no effect (unused right now anyway)

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

function calculateBytesPerSecond(bytes: number, timeMillis: number) {
  if (timeMillis === 0) {
    return 0;
  }
  return (bytes / timeMillis) * 1000;
}

class DownloadProgress {
  currentAttemptBytesDownloaded: number = 0;
  currentAttemptBaseBytes: number = 0;

  totalBytesDownloaded: number = 0;
  totalBytes: number = 0;
  retries: number = 0;

  startTime: Date = new Date();

  lastReportTime: Date = new Date();
  lastReportBytes: number = 0;

  totalPausedTime: number = 0;

  pausedAt?: number;

  generateProgressReport(): DownloadProgressReport {
    const now = new Date();
    const durationMillis = now.getTime() - this.startTime.getTime();
    const averageBytesPerSecond = calculateBytesPerSecond(this.totalBytes, durationMillis);
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

  update(
    progress: {
      transferred: number;
      total?: number;
    },
    at?: Date
  ) {
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
    return calculateBytesPerSecond(bytesSinceLastUpdate, timeSinceLastUpdate);
  }

  paused() {
    this.pausedAt = Date.now();
  }

  resumed() {
    if (this.pausedAt) {
      const now = Date.now();
      this.totalPausedTime += now - this.pausedAt;
      this.pausedAt = undefined;
    }
  }
}

export type ProgressListener = (progressReport: DownloadProgressReport) => void;

export type DownloadOptions = {
  headers: Headers;
  progressListener?: ProgressListener;
  maxResumeAttempts: number;
  range?: {
    start: number;
    end?: number;
  };
  label: string;
  throwOnError: boolean;
};

export enum DownloadState {
  NOT_STARTED = "NOT_STARTED",
  DOWNLOADING = "DOWNLOADING",
  PAUSED = "PAUSED",
  STOPPED = "STOPPED",
  DOWNLOADED = "DOWNLOADED",
  FAILED = "FAILED",
}

export interface DownloadedResult {
  status: DownloadState.DOWNLOADED;
  destination: string;
  stats: DownloadProgressReport;
}

export interface FailedDownloadResult {
  status: DownloadState.FAILED;
  error: any;
}

export interface StoppedDownloadResult {
  status: DownloadState.STOPPED;
}

export type DownloadResult = DownloadedResult | FailedDownloadResult | StoppedDownloadResult;

const defaultDownloadOptions: DownloadOptions = {
  headers: {},
  maxResumeAttempts: 20,
  label: "",
  throwOnError: true,
};

export class DownloadInstance {
  private currentWriteStream?: fs.WriteStream;
  protected currentProgress: DownloadProgress = new DownloadProgress();
  private currentStream?: Request;
  private state: DownloadState = DownloadState.NOT_STARTED;
  protected readonly opts: DownloadOptions;
  constructor(
    protected logger: Logger,
    protected readonly url: string,
    protected readonly destination: string,
    opts: Partial<DownloadOptions>
  ) {
    this.opts = {
      ...defaultDownloadOptions,
      label: opts.label || this.url,
      ...opts,
    };
  }

  generateProgressReport() {
    return this.currentProgress.generateProgressReport();
  }

  async download(clearFile: boolean = true): Promise<DownloadResult> {
    if (clearFile) {
      const file = await fsPromises.open(this.destination, "w");
      await file.close();
    }
    this.logger.log(LogLevel.INFO, `Starting download for ${this.opts.label}`);
    return await this.downloadInternal();
  }

  async stop() {
    if (!this.currentStream) {
      throw new Error("No stream to resume");
    } else if (this.state !== DownloadState.DOWNLOADING && this.state !== DownloadState.PAUSED) {
      throw new Error(`Cannot stop download as it is in ${this.state} state`);
    }
    this.state = DownloadState.STOPPED;
    this.currentStream.destroy();
  }

  async stopAndDelete() {
    await this.stop();
    await fsPromises.rm(this.destination);
  }

  async pause() {
    //TODO: Fix this
    throw new Error("Not implemented");
    // if (!this.currentStream) {
    //   throw new Error("No stream to resume");
    // } else if (this.state !== DownloadState.DOWNLOADING) {
    //   throw new Error(`Cannot pause download as it is in ${this.state} state`);
    // }
    // this.logger.log(LogLevel.INFO, `Pausing download for ${this.downloadOptions.label}`);
    // this.state = DownloadState.PAUSED;
    // this.currentStream.pause();
    // this.currentProgress.paused();
  }

  async resume() {
    if (!this.currentStream) {
      throw new Error("No stream to resume");
    } else if (this.state !== DownloadState.PAUSED) {
      throw new Error(`Cannot resume download as it is in ${this.state} state`);
    }
    this.currentStream?.resume();
    this.currentProgress.resumed();
  }

  protected makeStartOffset(additionalOffset: number = 0) {
    let start = this.opts.range?.start;
    if (!start && !additionalOffset) {
      return 0;
    }
    return (start || 0) + (additionalOffset || 0);
  }

  private makeRangeHeader(additionalOffset?: number) {
    const start = this.makeStartOffset(additionalOffset);
    const end = this.opts.range?.end;
    if (start === 0 && !end) {
      return undefined;
    }
    return `bytes=${start}-${end ? end : ""}`;
  }

  private async downloadInternal(request?: Request): Promise<DownloadResult> {
    const { maxResumeAttempts, progressListener, headers } = this.opts;
    this.state = DownloadState.DOWNLOADING;
    return new Promise(async (resolve, reject) => {
      this.currentStream =
        request ??
        got.stream(this.url, {
          headers: {
            ...headers,
            Range: this.makeRangeHeader(this.currentProgress.currentAttemptBaseBytes),
          },
          retry: {
            limit: maxResumeAttempts,
          },
        });
      const stream = this.currentStream;
      stream.on("response", (res: Response) => {
        this.logger.log(LogLevel.DEBUG, `Got response ${res.statusCode} ${JSON.stringify(res.headers)}`);
      });
      let lastProgressTime = 0;
      stream.on("downloadProgress", (progress: Progress) => {
        const now = new Date();
        this.currentProgress.update(progress);
        if (now.getTime() - lastProgressTime > progressReportInterval) {
          const progressReport = this.currentProgress.generateProgressReport();
          if (progressListener) {
            progressListener(progressReport);
          }
          lastProgressTime = now.getTime();
          // this.logger.log(
          //   LogLevel.DEBUG,
          //   `Download progress for ${this.url}: ${downloadProgressToString(progressReport)}`
          // );
        }
      });
      stream.once(
        "retry",
        (retryCount: number, error: any, createRetryStream: (updatedOptions?: OptionsInit) => Request) => {
          if (this.state === DownloadState.STOPPED) {
            this.logger.log(LogLevel.INFO, `Download ${this.opts.label} is STOPPED, not retrying`);
            return resolve({
              status: DownloadState.STOPPED,
            });
          }
          this.currentProgress.retryAttempt();
          this.logger.log(
            LogLevel.INFO,
            `Download retry for ${this.opts.label}. ${downloadProgressToString(
              this.currentProgress.generateProgressReport()
            )}`
          );
          this.downloadInternal(
            createRetryStream({
              headers: {
                ...headers,
                Range: this.makeRangeHeader(this.currentProgress.currentAttemptBaseBytes),
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
        this.state = DownloadState.FAILED;
        if (this.currentWriteStream) {
          this.currentWriteStream.destroy();
        }
        if (this.opts.throwOnError) {
          reject(e);
        } else {
          resolve({
            status: DownloadState.FAILED,
            error: e,
          });
        }
        this.logger.log(LogLevel.ERROR, `Download of ${this.opts.label} to ${this.destination} failed:`, e);
      });
      stream.on("end", (e: any) => {
        this.state = DownloadState.DOWNLOADED;
        if (this.currentWriteStream) {
          this.currentWriteStream.destroy();
        }
        const finalProgress = this.generateProgressReport();
        if (this.opts.progressListener) {
          this.opts.progressListener(finalProgress);
        }
        resolve({
          status: DownloadState.DOWNLOADED,
          destination: this.destination,
          stats: finalProgress,
        });
        this.logger.log(LogLevel.INFO, `Download of ${this.opts.label} to ${this.destination} succeeded`);
      });
      stream.on("close", () => {
        //TODO: Handle more cases?
        if (this.state === DownloadState.STOPPED) {
          resolve({
            status: DownloadState.STOPPED,
          });
        }
      });
      if (this.currentWriteStream) {
        this.currentWriteStream.destroy();
      }
      this.currentWriteStream = fs.createWriteStream(this.destination, {
        start: this.makeStartOffset(this.currentProgress.currentAttemptBaseBytes),
        flags: "r+",
      });
      await pipeline(stream, this.currentWriteStream).catch((e) => {});
    });
  }
}

export class MultiConnectionDownloadInstance {
  downloadInstances: DownloadInstance[] = [];
  startTime: Date = new Date();
  lastReportTime: number = new Date().getTime();
  lastProgressReport?: DownloadProgressReport;
  protected currentProgress: DownloadProgress = new DownloadProgress();
  private state: DownloadState = DownloadState.NOT_STARTED;

  constructor(
    private readonly logger: Logger,
    private url: string,
    private destination: string,
    protected readonly maxConnections: number,
    private readonly opts: Partial<DownloadOptions>
  ) {}

  generateProgressReport(): DownloadProgressReport {
    const instanceProgressReports = this.downloadInstances.map((downloadInstance) =>
      downloadInstance.generateProgressReport()
    );
    const { totalBytesDownloaded, totalBytes, retries } = instanceProgressReports.reduce(
      (toReturn, progressReport) => {
        if (progressReport) {
          (toReturn.totalBytes += progressReport.totalBytes),
            (toReturn.totalBytesDownloaded += progressReport.totalBytesDownloaded),
            (toReturn.retries += progressReport.retries);
        }
        return toReturn;
      },
      {
        totalBytesDownloaded: 0,
        totalBytes: 0,
        retries: 0,
      }
    );
    const now = new Date().getTime();
    const durationMillis = now - this.startTime.getTime();
    const percentComplete = totalBytesDownloaded / totalBytes || 999999999999;
    const bytesSinceLastReport = this.lastProgressReport
      ? totalBytesDownloaded - this.lastProgressReport.totalBytesDownloaded
      : totalBytesDownloaded;
    const timeSinceLastReport = now - this.lastReportTime;
    const toReturn = {
      totalBytesDownloaded,
      totalBytes,
      retries,
      percentComplete,
      bytesPerSecond: calculateBytesPerSecond(bytesSinceLastReport, timeSinceLastReport),
      startTime: this.startTime,
      durationMillis,
      averageBytesPerSecond: calculateBytesPerSecond(totalBytesDownloaded, durationMillis),
    };
    this.lastProgressReport = toReturn;
    this.lastReportTime = now;
    return toReturn;
  }

  async download(): Promise<DownloadResult> {
    const progressListener = this.opts.progressListener;
    let err: any;
    this.state = DownloadState.DOWNLOADING;
    this.logger.log(LogLevel.INFO, `Starting download for ${this.url} with ${this.maxConnections} connections`);
    const options = await got.head(this.url);
    if (!options.headers["accept-ranges"]?.includes("bytes")) {
      this.logger.log(
        LogLevel.WARN,
        `Unable to use multiple connections for ${this.url} as Accept-Ranges not set or is not "bytes" - using single connection`
      );
      const downloadInstance = new DownloadInstance(this.logger, this.url, this.destination, this.opts);
      return downloadInstance.download();
    }
    const contentLength = parseInt(options.headers["content-length"] || "");
    const eachDownloadSize = Math.floor(contentLength / this.maxConnections);
    const file = await fsPromises.open(this.destination, "w");
    await file.close();
    this.currentProgress.totalBytes = contentLength;
    this.startTime = new Date();
    for (let i = 0; i < this.maxConnections; i++) {
      const start = i * eachDownloadSize;
      const end = i === this.maxConnections - 1 ? undefined : start + eachDownloadSize;
      this.downloadInstances.push(
        new DownloadInstance(this.logger, this.url, this.destination, {
          ...this.opts,
          range: {
            start,
            end: end,
          },
          progressListener: undefined,
          label: `${this.url} part ${i} of ${this.maxConnections}`,
          throwOnError: true,
        })
      );
    }
    let cancelTimer;
    if (progressListener) {
      cancelTimer = setInterval(() => {
        progressListener(this.generateProgressReport());
      }, progressReportInterval);
    }
    try {
      const results = await Promise.all(
        this.downloadInstances.map((downloadInstance) => downloadInstance.download(false))
      );
      for (const result of results) {
        if (result.status === DownloadState.FAILED) {
          this.state = DownloadState.FAILED;
          err = result.status;
          return result;
        } else if (result.status === DownloadState.STOPPED) {
          this.state = DownloadState.STOPPED;
          return result;
        }
      }
    } catch (e) {
      await this.stopAndDelete();
      err = e;
    } finally {
      cancelTimer && clearInterval(cancelTimer);
      if (err) {
        if (this.opts.throwOnError === true) {
          throw err;
        } else {
          return {
            status: DownloadState.FAILED,
            error: err,
          };
        }
      }
    }
    const finalProgress = this.generateProgressReport();
    if (progressListener) {
      progressListener(finalProgress);
    }
    return {
      status: DownloadState.DOWNLOADED,
      destination: this.destination,
      stats: finalProgress,
    };
  }

  async pause() {
    if (this.state !== DownloadState.DOWNLOADING) {
      throw new Error(`Cannot pause download as it is in ${this.state} state`);
    }
    await Promise.all(this.downloadInstances.map((downloadInstance) => downloadInstance.pause()));
    this.state = DownloadState.PAUSED;
  }

  async resume() {
    if (this.state !== DownloadState.PAUSED) {
      throw new Error(`Cannot resume download as it is in ${this.state} state`);
    }
    await Promise.all(this.downloadInstances.map((downloadInstance) => downloadInstance.resume()));
    this.state = DownloadState.DOWNLOADING;
  }

  async stop() {
    if (this.state !== DownloadState.DOWNLOADING) {
      throw new Error(`Cannot stop download as it is in ${this.state} state`);
    }
    await Promise.all(this.downloadInstances.map((downloadInstance) => downloadInstance.stop()));
    this.state = DownloadState.STOPPED;
  }

  async stopAndDelete() {
    await this.stop();
    await fsPromises.rm(this.destination);
  }
}

export async function download(
  logger: Logger,
  url: string,
  destination: string,
  downloadOptions: Partial<DownloadOptions>
) {
  const maxConnections = config.maxConnectionsPerDownload;
  let downloadInstance: DownloadInstance | MultiConnectionDownloadInstance;
  if (!maxConnections || maxConnections === 1) {
    downloadInstance = new DownloadInstance(logger, url, destination, downloadOptions);
  } else {
    downloadInstance = new MultiConnectionDownloadInstance(logger, url, destination, 5, downloadOptions);
  }
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
