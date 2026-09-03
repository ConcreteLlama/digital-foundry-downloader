import { configService } from "../config/config.js";
import { TaskManager, TaskManagerOpts } from "../task-manager/task-manager.js";

/**
 * The queue for work that runs a model on this machine.
 *
 * Whisper transcription and local AI analysis both claim most of the cores, so
 * they cannot usefully run together - and they now share this one queue rather
 * than sitting in separate queues with a lock between them that the scheduler
 * could not see. See docs/LOCAL_MODELS_QUEUE_DESIGN.md for why that lock went.
 *
 * Hosted analysis deliberately does not come here: it uses none of this
 * machine, so queueing a Claude run behind a transcription would be a delay
 * bought for nothing.
 *
 * Concurrency is re-read on config change rather than at startup only, since
 * it is the setting most likely to be tuned to the machine it runs on.
 */
export class LocalModelsTaskManager extends TaskManager {
  constructor(taskManagerOpts: TaskManagerOpts = {}) {
    super(taskManagerOpts);
    configService.on("configUpdated:localModels", (event) => {
      const maxConcurrent = event?.newValue?.maxConcurrent;
      if (maxConcurrent && maxConcurrent !== this.concurrentTasks) {
        this.concurrentTasks = maxConcurrent;
        this.log("info", `Updated local models concurrent tasks to ${maxConcurrent}`);
      }
    });
  }
}
