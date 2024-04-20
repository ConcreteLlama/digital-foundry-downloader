import { LoggerType, makeLogger } from "../../../utils/log.js";
import { RetryContext } from "../../../utils/retry-context.js";
import { DownloadConnection } from "../download-connection.js";
import { DownloadConnectionProgressInfo } from "./download-connection-progress-info.js";
import { DownloadCapabilities, DownloadConnectionOptions, DownloadConnectionResult } from "./types.js";

export class DownloadConnectionContext {
  totalProgress: DownloadConnectionProgressInfo = new DownloadConnectionProgressInfo();
  currentProgress: DownloadConnectionProgressInfo = new DownloadConnectionProgressInfo();
  log: LoggerType;
  totalFileSize?: number;
  readonly capabilities: DownloadCapabilities;
  retryContext: RetryContext;

  currentResponse: Response | null = null;
  currentReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private _result: DownloadConnectionResult | null = null;
  currentUrl?: string;

  constructor(
    public readonly options: DownloadConnectionOptions,
    private readonly wrapperEmitter: DownloadConnection,
    capabilities?: Partial<DownloadCapabilities>
  ) {
    this.log = makeLogger(options.label, options.logger);
    this.capabilities = {
      supportsByteRangeHeaders: false,
      ...capabilities,
    };
    this.retryContext = new RetryContext(options.retryOpts || {});
  }

  updateProgress(bytesDownloaded: number) {
    this.totalProgress.addBytesDownloaded(bytesDownloaded);
    this.currentProgress.addBytesDownloaded(bytesDownloaded);
  }

  isProgressMade() {
    this.log("silly", "is progress made - current bytes downloaded", this.totalProgress.bytesDownloaded);
    return this.totalProgress.bytesDownloaded > 0;
  }

  get result() {
    return this._result;
  }

  set result(result: DownloadConnectionResult | null) {
    this._result = result;
    result && this.wrapperEmitter.emit("completed", result);
  }
}
