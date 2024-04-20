import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { RetryContext, RetryOpts } from "../../utils/retry-context.js";
import { TaskManager } from "../task-manager.js";
import { InferTaskTaskResult, Task } from "./task.js";

export type TaskOpts = {
  priority: number;
};
export type TaskManagerInternalTaskOpts = {
  retryOpts: RetryOpts;
};
export class TaskManagerInternalTask<
  TASK_TYPE extends Task<any, any, any> = Task<any, any, any>,
  TASK_MANAGER_TYPE extends TaskManager = TaskManager
> {
  retryContext: RetryContext;
  managedTask: ManagedTask<TASK_TYPE, TASK_MANAGER_TYPE>;
  addResult: (result: InferTaskTaskResult<TASK_TYPE>, isFinal: boolean) => void;
  retryReady = false;

  constructor(readonly task: TASK_TYPE, taskManager: TASK_MANAGER_TYPE, opts: TaskManagerInternalTaskOpts) {
    this.retryContext = new RetryContext(opts.retryOpts);
    const managedTaskInfo = ManagedTask.create(this, task, taskManager);
    this.managedTask = managedTaskInfo.managedTask;
    this.addResult = managedTaskInfo.addResult;
  }

  getResult() {
    return this.task.result;
  }

  async requeue() {
    this.task.pause("auto");
  }

  isStartable() {
    const state = this.task.getTaskState();
    return (
      state !== "running" &&
      (state === "idle" ||
        (state === "paused" && this.task.pauseTrigger === "auto") ||
        (state === "awaiting_retry" && this.retryReady))
    );
  }
}

type TaskCompletedResult<TASK_TYPE extends Task<any, any, any>, RESULT_TYPE = InferTaskTaskResult<TASK_TYPE>> = {
  task: TASK_TYPE;
  result: RESULT_TYPE;
  results: RESULT_TYPE[];
  attempts: number;
};

export class ManagedTask<
  TASK_TYPE extends Task<any, any, any>,
  TASK_MANAGER_TYPE extends TaskManager = TaskManager
> extends CachedEventEmitter<{
  taskCompleted: TaskCompletedResult<TASK_TYPE>;
}> {
  static create<TASK_TYPE extends Task<any, any, any>, TASK_MANAGER_TYPE extends TaskManager>(
    taskManagerTask: TaskManagerInternalTask,
    task: TASK_TYPE,
    taskManager: TASK_MANAGER_TYPE
  ) {
    const managedTask = new ManagedTask(task, taskManager, () => taskManagerTask.retryContext.attempt);
    return {
      managedTask,
      addResult: (result: InferTaskTaskResult<TASK_TYPE>, isFinal: boolean) => {
        managedTask.addResult(result, isFinal);
      },
    };
  }
  results: InferTaskTaskResult<TASK_TYPE>[] = [];
  finalResult: InferTaskTaskResult<TASK_TYPE> | undefined;
  private constructor(
    readonly task: TASK_TYPE,
    readonly taskManager: TASK_MANAGER_TYPE,
    private readonly getAttempt: () => number
  ) {
    super();
  }

  get attempt() {
    return this.getAttempt();
  }

  isCompleted() {
    return Boolean(this.finalResult);
  }
  async awaitResult() {
    return await new Promise<InferTaskTaskResult<TASK_TYPE>>((resolve) => {
      this.once("taskCompleted", (result) => {
        resolve(result.result);
      });
    });
  }
  private addResult(result: InferTaskTaskResult<TASK_TYPE>, isFinal: boolean) {
    this.results.push(result);
    if (isFinal) {
      this.finalResult = result;
      this.emit("taskCompleted", {
        task: this.task,
        result,
        results: this.results,
        attempts: this.attempt,
      });
      if (result.status !== "success") {
        this.task.cleanup();
      }
    }
  }
  shiftTask(direction: "up" | "down", allowPriorityChange: boolean = false) {
    this.taskManager.shiftTask(this.task.id, direction, allowPriorityChange);
  }
  changePriority(priority: number) {
    this.taskManager.changeTaskPriority(this.task.id, priority);
  }
  changePosition(position: number) {
    this.taskManager.changeTaskPosition(this.task.id, position);
  }
  resume() {
    this.taskManager.resumeTask(this.task.id);
  }
  forceStart() {
    this.task.start(true);
  }
}
export type GenericManagedTask = ManagedTask<Task<any, any, any>, TaskManager>;
