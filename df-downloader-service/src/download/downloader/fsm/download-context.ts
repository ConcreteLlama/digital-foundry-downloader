import { LoggerType, makeLogger } from "../../../utils/log.js";
import { DownloadConnection } from "../../download-connection/download-connection.js";
import {
  CancelledDownloadConnectionResult,
  DownloadConnectionResult,
  DownloadConnectionStates,
  FailedDownloadConnectionResult,
  SuccessDownloadConnectionResult,
  isCancelledDownloadConnectionResult,
  isSuccessDownloadConnectionResult,
} from "../../download-connection/fsm/types.js";
import { DownloadUrl } from "../../download-url.js";
import { DownloadResult } from "../download-result.js";
import { Download } from "../downloader.js";
import { DownloadOptions } from "../types.js";

export class DownloadConnectionInfo {
  readonly connection: DownloadConnection;
  stateSnapshot: DownloadConnectionStates;
  result?: DownloadConnectionResult;

  constructor(connection: DownloadConnection) {
    this.connection = connection;
    this.stateSnapshot = connection.getState();
  }
}

export type DownloadContextStatus = {
  startTime?: Date;
  runningTime: number;
  bytesDownloaded: number;
  bytesToDownload: number;
  currentBytesPerSecond: number;
  averageBytesPerSecond: number;
  percentComplete: number;
  connections: DownloadConnectionInfo[];
};

export class DownloadContext {
  connections: DownloadConnectionInfo[] = [];
  log: LoggerType;
  startTime?: Date;
  currentEtag?: string | null;
  private _result: DownloadResult | null = null;
  downloadUrl: DownloadUrl;

  constructor(public options: DownloadOptions, private readonly wrapperEmitter: Download) {
    this.log = makeLogger(options.label || "Download", options.logger);
    this.downloadUrl = new DownloadUrl(options.url, {
      ...(options.resolveOptions || {}),
      resolveInitial: true,
    });
  }

  getStatus(): DownloadContextStatus {
    const toReturn = this.connections.reduce(
      (acc, { connection }) => {
        const { bytesDownloaded, bytesToDownload, bytesPerSecond } = connection.getProgress();
        acc.bytesDownloaded += bytesDownloaded;
        acc.bytesToDownload += bytesToDownload;
        acc.currentBytesPerSecond += bytesPerSecond || 0;
        return acc;
      },
      {
        startTime: this.startTime,
        // TODO: Have this only count the time the download has been running, not paused/awaiting retry etc
        runningTime: this.startTime ? Date.now() - this.startTime.getTime() : 0,
        averageBytesPerSecond: 0,
        bytesDownloaded: 0,
        bytesToDownload: 0,
        currentBytesPerSecond: 0,
        percentComplete: 0,
        connections: this.connections,
      }
    );
    toReturn.percentComplete =
      toReturn.bytesToDownload > 0 ? (toReturn.bytesDownloaded / toReturn.bytesToDownload) * 100 : 0;
    toReturn.averageBytesPerSecond =
      toReturn.runningTime > 0 ? toReturn.bytesDownloaded / (toReturn.runningTime / 1000) : 0;
    return toReturn;
  }

  setConnections(connections: DownloadConnection[]) {
    this.connections = connections.map((connection) => new DownloadConnectionInfo(connection));
  }

  addConnection(connection: DownloadConnection) {
    this.connections.push(new DownloadConnectionInfo(connection));
  }

  reduceConnectionResults() {
    return this.connections.reduce(
      (acc, { result }) => {
        if (!result) {
          return acc;
        }
        if (isSuccessDownloadConnectionResult(result)) {
          acc.succeeded.push(result);
        } else if (isCancelledDownloadConnectionResult(result)) {
          acc.cancelled.push(result);
        } else if (result.status === "failed") {
          acc.failed.push(result);
        }
        acc.all.push(result);
        return acc;
      },
      {
        cancelled: [],
        succeeded: [],
        failed: [],
        all: [],
      } as {
        cancelled: CancelledDownloadConnectionResult[];
        succeeded: SuccessDownloadConnectionResult[];
        failed: FailedDownloadConnectionResult[];
        all: DownloadConnectionResult[];
      }
    );
  }

  set result(result: DownloadResult | null) {
    this.log("info", `Setting result to`, result);
    this._result = result;
    if (result) {
      this.wrapperEmitter.emit("completed", result);
    }
  }

  get result() {
    return this._result;
  }
}
