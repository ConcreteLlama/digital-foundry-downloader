import { bytesToHumanReadable } from "df-downloader-common";
import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { DownloadContext } from "./fsm/download-context.js";
import { DownloadResult, isSuccessDownloadResult } from "./download-result.js";
import { DownloadOptions, DownloadStatus } from "./types.js";
import { DownloadFSM } from "./fsm/downloader-fsm.js";
import { DownloadStates } from "./fsm/types.js";

type DownloadEventMap = {
  stateChanged: DownloadStates;
  completed: DownloadResult;
};

export class Download extends CachedEventEmitter<DownloadEventMap> {
  private fsm: DownloadFSM;
  private context: DownloadContext;
  constructor(options: DownloadOptions) {
    super();
    this.context = new DownloadContext(options, this);
    this.fsm = DownloadFSM(this.context, {
      logger: options.logger,
      label: options.label ? `${options.label}-FSM` : undefined,
    });
    this.fsm.on("stateChanged", (state) => {
      this.emit("stateChanged", state);
    });
  }

  start() {
    return this.fsm.dispatch("start");
  }

  pause() {
    return this.fsm.dispatch("pause");
  }

  cancel() {
    return this.fsm.dispatch("cancel");
  }

  prepareForRetry() {
    return this.fsm.dispatch("prepare_for_retry");
  }

  cleanup() {
    return this.fsm.dispatch("cleanup", null);
  }

  getState() {
    return this.fsm.currentState;
  }

  getCurrentProgress() {
    return this.context.getStatus();
  }

  getProgressString() {
    const { bytesDownloaded, bytesToDownload, currentBytesPerSecond: bytesPerSecond } = this.context.getStatus();
    const percentage = ((bytesDownloaded / bytesToDownload) * 100).toFixed(2);
    return `${bytesToHumanReadable(bytesDownloaded)}/${bytesToHumanReadable(
      bytesToDownload
    )} (${percentage}) Speed: ${bytesToHumanReadable(bytesPerSecond)}/s`;
  }

  awaitResult() {
    return new Promise<DownloadResult>((resolve) => {
      if (this.context.result) {
        return resolve(this.context.result);
      }
      this.once("completed", (result) => {
        resolve(result);
      });
    });
  }

  getResult() {
    return this.context.result;
  }

  getStatus(): DownloadStatus {
    return {
      ...this.context.getStatus(),
      state: this.fsm.currentState,
    };
  }
}
