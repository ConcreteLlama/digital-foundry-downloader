import Queue, { QueueOptions } from "better-queue";
import { logger } from "df-downloader-common";

let queueIdIncr = 0;

const allWorkerQueues = new Set<WorkerQueue>();

type WorkerQueueOptions = {
  namePrefix: string;
} & Partial<QueueOptions<any, any>>;
export class WorkerQueue {
  readonly queueId = queueIdIncr++;
  readonly name: string;
  readonly queue: Queue;
  readonly isRetry: boolean;
  private _activeJobs = 0;
  private _queuedJobs = 0;
  private _closing = false;

  constructor(opts: WorkerQueueOptions) {
    this.isRetry = opts.maxRetries && opts.maxRetries > 0 ? true : false;
    allWorkerQueues.add(this);
    this.name = `${opts.namePrefix}-${this.queueId}`;
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
    if (this._closing) {
      throw new Error("Queue is closing");
    }
    this._queuedJobs++;
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        this._queuedJobs--;
        this._activeJobs++;
        try {
          const result = await fn();
          resolve(result);
          this._activeJobs--;
        } catch (e) {
          reject(e);
          this._activeJobs--;
        }
      });
    });
  }

  pause() {
    this.queue.pause();
  }

  resume() {
    this.queue.resume();
  }

  async cancel() {
    return new Promise<void>((resolve, reject) => {
      this.queue.destroy(() => {
        resolve();
      });
    });
  }

  getQueueSize() {
    return (this.queue as any).length;
  }

  async close(timeout: number = 60000, mode: 'wait_for_current_job' | 'wait_for_all_jobs' = 'wait_for_current_job') {
    logger.log("info", `Closing queue ${this.name} with timeout ${timeout} - mode: ${mode}`);
    if (mode === 'wait_for_current_job') {
      this.queue.pause();
    }
    const whileCheck = mode === 'wait_for_current_job' ? () => this._activeJobs > 0 : () => this._queuedJobs > 0;
    let startTime = Date.now();
    while (whileCheck() && (Date.now() - startTime) < timeout) {
      logger.log("info", `${this.name}: Waiting for ${this._activeJobs} active jobs to complete`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await new Promise<void>((resolve, reject) => {
      this.queue.destroy(() => {
        resolve();
      });
    });
    logger.log("info", `Queue ${this.name} closed`);
  }
}

export const dfFetchWorkerQueue = new WorkerQueue({
  namePrefix: "df-fetch",
  concurrent: 5,
});

export const fileScannerQueue = new WorkerQueue({
  namePrefix: "file-scanner",
  concurrent: 20,
});

export const closeAllQueues = async (timeout: number = 60000) => {
  logger.log("info", `Closing ${allWorkerQueues.size} queues with timeout ${timeout}`);
  const closePromises = Array.from(allWorkerQueues).map((queue) => queue.close(timeout));
  await Promise.allSettled(closePromises);
  logger.log("info", "All queues closed");
}

export const forceCloseAllQueues = async () => {
  logger.log("info", `Force closing ${allWorkerQueues.size} queues`);
  const closePromises = Array.from(allWorkerQueues).map((queue) => queue.close(0));
  await Promise.allSettled(closePromises);
}