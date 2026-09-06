import { DownloadProgressInfo, bytesToHumanReadable } from "df-downloader-common";
import _ from "lodash";
import { configService } from "../config/config.js";
import {
  DownloadResult,
  SuccessDownloadResult,
  isSuccessDownloadResult,
} from "../download/downloader/download-result.js";
import { Download } from "../download/downloader/downloader.js";
import { DownloadStates } from "../download/downloader/fsm/types.js";
import { DownloadOptions, DownloadStatus } from "../download/downloader/types.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";
import { TaskOutputField } from "df-downloader-common";
import { Task, TaskOpts, TaskResult, TaskState } from "../task-manager/task/task.js";

/**
 * What a finished download amounted to, for the step's detail view.
 *
 * Opening a completed download step said "success, 100% complete" - the one
 * thing the row it was opened from had already said. The figures worth
 * keeping are the ones that cannot be recovered afterwards: how big it turned
 * out to be, how fast it actually went, how long it took.
 *
 * Only once there is something to report. A download that has not started has
 * nothing to say, and a row of zeroes reads as a failure rather than as an
 * absence.
 */
const describeDownload = (status: DownloadStatus): TaskOutputField[] | undefined => {
  if (!status.bytesDownloaded) {
    return undefined;
  }
  const fields: TaskOutputField[] = [{ label: "Downloaded", value: bytesToHumanReadable(status.bytesDownloaded) }];
  // Only when they disagree - which mid-download is normal, and at the end
  // means the file was not what the listing promised.
  if (status.bytesToDownload && status.bytesToDownload !== status.bytesDownloaded) {
    fields.push({ label: "Expected", value: bytesToHumanReadable(status.bytesToDownload) });
  }
  if (status.averageBytesPerSecond) {
    fields.push({ label: "Average speed", value: `${bytesToHumanReadable(status.averageBytesPerSecond)}/s` });
  }
  if (status.runningTime) {
    const seconds = Math.round(status.runningTime / 1000);
    const minutes = Math.floor(seconds / 60);
    fields.push({ label: "Took", value: minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s` });
  }
  return fields;
};

export class DownloadTask extends Task<SuccessDownloadResult, DownloadStatus, DownloadStates> {
  private download: Download;
  constructor(downloadOptions: DownloadOptions, taskOpts: Partial<TaskOpts> = {}) {
    super({
      taskType: "download",
      /*
       * The one task type allowed past its manager's limit when forced.
       *
       * Force start began as a download gesture on the reasoning that one more
       * transfer is harmless. Bounded at one rather than unlimited: forcing
       * several must not open several extra connections to a site this app is
       * deliberately gentle with.
       */
      canBreakConcurrency: 1,
      ...taskOpts,
    });
    this.download = new Download(downloadOptions);
    this.download.on("completed", (result) => {
      this.log("info", "Download completed", result);
      this.setResult(this.makeResult(result));
    });
    this.download.on("stateChanged", (state) => {
      this.emit("stateChanged", state);
    });
    this.log(
      "debug",
      `Created download task with options: ${{
        ...downloadOptions,
        headers: "REDACTED",
      }}`
    );
  }
  stateToTaskState(state: DownloadStates): TaskState {
    switch (state) {
      case "idle":
        return "idle";
      case "pausing":
        return "pausing";
      case "paused":
        return "paused";
      case "cancelling":
        return "cancelling";
      case "cancelled":
        return "cancelled";
      case "failed":
        return "failed";
      case "success":
        return "success";
      case "awaiting_retry":
        return "awaiting_retry";
      default:
        return "running";
    }
  }
  getInternalState(): DownloadStates {
    return this.download.getState();
  }
  protected startInternal() {
    return this.download.start();
  }
  protected pauseInternal() {
    return this.download.pause();
  }
  protected resumeInternal() {
    return this.download.start();
  }
  protected cancelInternal() {
    return this.download.cancel();
  }
  prepareForRetry() {
    return this.download.prepareForRetry();
  }
  cleanup() {
    return this.download.cleanup();
  }
  getStatus(): DownloadStatus & { output?: TaskOutputField[] } {
    const status = this.download.getStatus();
    return { ...status, output: describeDownload(status) };
  }
  makeResult(result: DownloadResult): TaskResult<SuccessDownloadResult> {
    if (isSuccessDownloadResult(result)) {
      return {
        status: "success",
        result,
      };
    } else if (result.status === "cancelled") {
      return {
        status: "cancelled",
      };
    } else {
      return {
        status: "failed",
        error: result.error || "Unknown error",
      };
    }
  }
  getStatusMessage(): string {
    return this.download.getStatusMessage();
  }
  async awaitResult(): Promise<TaskResult<SuccessDownloadResult>> {
    const result = await this.download.awaitResult();
    return this.makeResult(result);
  }
}
export class DownloadTaskManager extends TaskManager {
  constructor(taskManagerOpts: TaskManagerOpts = {}) {
    super(taskManagerOpts);
    configService.on("configUpdated:downloads", ({ newValue }) => {
      const newRetries = {
        maxRetries: newValue.maxRetries,
        retryDelay: newValue.failureRetryIntervalBase,
        retryDelayMultiplier: newValue.retryDelayMultiplier,
        maxRetryDelay: newValue.maxRetryDelay,
      };
      if (!_.isEqual(newRetries, this.retries)) {
        this.retries = newRetries;
        this.log("info", "Updated download task manager retries", this.retries);
      }
      if (newValue.maxSimultaneousDownloads !== this.concurrentTasks) {
        this.concurrentTasks = newValue.maxSimultaneousDownloads;
        this.log("info", "Updated download task manager concurrent tasks", this.concurrentTasks);
      }
    });
  }
}

export function downloadProgressToString(downloadProgress: DownloadProgressInfo) {
  return (
    `${downloadProgress.percentComplete.toFixed(2)}% (${bytesToHumanReadable(
      downloadProgress.totalBytesDownloaded
    )} / ${bytesToHumanReadable(downloadProgress.totalBytes)})` +
    ` ${bytesToHumanReadable(downloadProgress.currentBytesPerSecond)} per second${
      downloadProgress.retries > 0 ? ` with ${downloadProgress.retries} retries` : ""
    }`
  );
}

export const isDownloadTask = (task?: Task<any, any, any>): task is DownloadTask => task?.taskType === "download";
