import Queue, { QueueOptions } from "better-queue";
import { logger } from "df-downloader-common";

export class WorkerQueue {
  readonly queue: Queue;
  readonly isRetry: boolean;
  constructor(opts: Partial<QueueOptions<any, any>> = {}) {
    this.isRetry = opts.maxRetries && opts.maxRetries > 0 ? true : false;
    this.queue = new Queue(async (fn: () => Promise<void>, cb) => {
      try {
        await fn();
      } catch (e) {
        logger.log("error", e);
        if (this.isRetry) {
          logger.log("error", "is retry");
          throw e;
        }
      }
      cb();
    }, opts);
  }

  async addWork<T>(fn: () => Promise<T> | T) {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
  }
}

export const dfFetchWorkerQueue = new WorkerQueue({
  concurrent: 5,
});

export const fileScannerQueue = new WorkerQueue({
  concurrent: 20,
});
