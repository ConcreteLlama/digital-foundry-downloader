import { LoggerType, makeLogger } from "./log.js";

export class RetryContext {
  retries: number = 0;
  currentDelay: number = 0;
  currentRetryTimer: NodeJS.Timeout | null = null;
  log: LoggerType;
  constructor(private readonly retryOpts: RetryOpts, logger?: LoggerType) {
    this.currentDelay = 0;
    this.log = makeLogger("RetryContext", logger);
  }
  retry(onRetry: () => void) {
    const { maxRetries = 0, retryDelay = 0, retryDelayMultiplier = 0, maxRetryDelay = Infinity } = this.retryOpts;
    if (this.retries >= maxRetries) {
      this.log("debug", `Not retrying; max retries of ${maxRetries} reached.`);
      return false;
    }
    this.currentDelay = Math.min(retryDelay * Math.pow(retryDelayMultiplier, this.retries), maxRetryDelay);
    this.retries++;
    this.log("debug", `Scheudling retry ${this.retries} in ${this.currentDelay}ms.`);
    this.currentRetryTimer = setTimeout(onRetry, this.currentDelay);
    return true;
  }

  get attempt() {
    return this.retries + 1;
  }
}

export type RetryOpts = {
  maxRetries?: number;
  retryDelay?: number;
  retryDelayMultiplier?: number;
  maxRetryDelay?: number;
};
