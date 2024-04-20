import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { DownloadConnectionContext } from "./fsm/download-connection-context.js";
import { DownloadConnectionFSM } from "./fsm/download-connection-fsm.js";
import { DownloadConnectionOptions, DownloadConnectionResult, DownloadConnectionStates } from "./fsm/types.js";

export class DownloadConnection extends CachedEventEmitter<{
  stateChanged: DownloadConnectionStates;
  completed: DownloadConnectionResult;
}> {
  private readonly fsm: DownloadConnectionFSM;
  private readonly context: DownloadConnectionContext;
  constructor(options: DownloadConnectionOptions) {
    super();
    this.context = new DownloadConnectionContext(options, this);
    this.fsm = DownloadConnectionFSM(this.context, {
      logger: options.logger,
      label: options.label ? `${options.label}-FSM` : undefined,
    });
    this.fsm.on("stateChanged", (state) => {
      this.emit("stateChanged", state);
    });
  }

  start() {
    this.fsm.dispatch("start");
  }
  pause() {
    this.fsm.dispatch("pause");
  }
  cancel() {
    this.fsm.dispatch("cancel");
  }
  getState() {
    return this.fsm.currentState;
  }
  getHeaders() {
    return this.context.options.headers;
  }
  getProgress() {
    return {
      bytesDownloaded: this.context.totalProgress.bytesDownloaded,
      bytesToDownload: this.context.totalProgress.totalBytes,
      bytesPerSecond: this.context.currentProgress.getBytesPerSecond(),
    };
  }
  getResult() {
    return this.context.result;
  }
  isCompleted() {
    return (
      this.fsm.currentState === "success" || this.fsm.currentState === "failed" || this.fsm.currentState === "cancelled"
    );
  }
  async awaitResult() {
    return new Promise<DownloadConnectionResult>((resolve) => {
      if (this.context.result) {
        return resolve(this.context.result);
      }
      this.once("completed", (result) => {
        resolve(result);
      });
    });
  }
}

export const createDownloadConnectionWithRange = (options: DownloadConnectionOptions) => {
  const headers = options.headers;
  return new DownloadConnection(options);
};
