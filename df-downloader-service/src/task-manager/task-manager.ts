import { Mutex } from "async-mutex";
import { mapFilterEmpty } from "df-downloader-common";
import { LoggerType, makeLogger } from "../utils/log.js";
import { RetryOpts } from "../utils/retry-context.js";
import { PriorityItemManager, PriorityPositionInfo } from "./priority-item-manager.js";
import { TaskManagerInternalTask } from "./task/task-manager-task.js";
import { InferTaskTaskResult, Task, TaskResult, TaskState } from "./task/task.js";

export type TaskManagerOpts = {
  concurrentTasks?: number;
  retries?: RetryOpts;
  autoClearCompletedTasks?: boolean;
  defaultPriority?: number;
  label?: string;
  logger?: LoggerType;
};

export type AddTaskOpts = {
  priority?: number;
};

/**
 * TaskManager is a class that manages tasks and their execution order. It allows for tasks to be added, removed, and reordered,
 * and will automatically start and stop tasks based on the number of concurrent tasks allowed.
 *
 * It is designed to be able to accept any Task type as it does not care about the specifics of the task,
 * only that it extends Task. A wrapped task's type is however inferred when added to the TaskManager
 * as this is useful for code adding tasks.
 */
export class TaskManager {
  private readonly mutex = new Mutex();
  private readonly taskMap: Map<string, TaskManagerInternalTask<Task<any, any, any>>> = new Map();
  private readonly priorityItemManager = new PriorityItemManager<TaskManagerInternalTask<Task<any, any, any>>>();
  private readonly startingTasks: Set<TaskManagerInternalTask<Task<any, any, any>>> = new Set();
  retries: RetryOpts;
  private _concurrentTasks: number;
  protected log: LoggerType;
  private defaultPriority: number;

  private autoClearCompletedTasks: boolean;

  constructor({
    retries,
    concurrentTasks = 1,
    autoClearCompletedTasks = true,
    label = "Task Manager",
    logger,
    defaultPriority = 1,
  }: TaskManagerOpts = {}) {
    this.retries = retries || {};
    this._concurrentTasks = concurrentTasks;
    this.autoClearCompletedTasks = autoClearCompletedTasks;
    this.log = makeLogger(label, logger);
    this.defaultPriority = defaultPriority;
  }

  /**
   * Adds a task to the task manager. The task will be started if it is eligible to run.
   * @param task
   * @param opts
   * @returns
   */
  addTask<TASK_TYPE extends Task<any, any, any>>(task: TASK_TYPE, opts: AddTaskOpts = {}) {
    this.log("info", "Adding task", { taskId: task.id });
    if (this.taskMap.has(task.id)) {
      throw new Error(`Task with id ${task.id} already exists`);
    }
    const taskWrapper = new TaskManagerInternalTask(task, this, {
      retryOpts: this.retries,
    });

    const statusChangedListener = (newState: TaskState) => {
      if (newState === "cancelled" || newState === "success" || newState === "failed") {
        // These are final states, and are handled in the completed event
        return;
      }
      this.log("info", "Task state changed", { taskId: task.id, status: taskWrapper.task.getStatus() });
      this.startEligibleTasks();
    };
    const completedListener = (taskResult: InferTaskTaskResult<TASK_TYPE>) => {
      this.log("info", `Task ${task.id} completed with status ${taskResult.status}`);
      if (taskResult.status === "failed") {
        taskWrapper.addResult(taskResult, false);
        const retryable = taskWrapper.retryContext.retry(() => {
          this.log("info", `Retrying task ${task.id} now, attempt ${taskWrapper.retryContext.attempt}`);
          taskWrapper.retryReady = true;
          this.startEligibleTasks();
        });
        if (retryable) {
          task.prepareForRetry();
          this.startEligibleTasks();
          this.log("info", `Task ${task.id} is retryable, requeuing in ${taskWrapper.retryContext.currentDelay}ms`);
          return;
        }
      }
      const forceRunFlagChangedListener = (forceRunFlag: boolean) => {
        if (!forceRunFlag) {
          this.reassessRunningTasks();
        } else {
          this.startEligibleTasks();
        }
      };
      task.on("forceRunFlagChanged", forceRunFlagChangedListener);
      task.off("taskStateChanged", statusChangedListener);
      task.off("completed", completedListener);
      task.off("forceRunFlagChanged", forceRunFlagChangedListener);
      if (this.autoClearCompletedTasks) {
        this.taskMap.delete(task.id);
      }
      this.priorityItemManager.removeItem(taskWrapper);
      taskWrapper.addResult(taskResult, true);
      this.startEligibleTasks();
    };

    task.on("taskStateChanged", statusChangedListener);
    task.on("completed", completedListener);

    this.taskMap.set(task.id, taskWrapper);
    this.priorityItemManager.addItem(taskWrapper, opts.priority || this.defaultPriority);
    this.startEligibleTasks();
    return taskWrapper.managedTask;
  }

  /**
   * Gets a list of tasks that are eligible to run.
   * @returns
   */
  getEligibleStartableTasks() {
    // We need startable and running as we're basically trying to get the top of the list of
    // tasks that should currently be running
    const startableAndRunningTasks = this.priorityItemManager.getFirstXItems(
      this._concurrentTasks,
      (task) => task.isStartable() || task.task.getTaskState() === "running"
    );

    const startableTasks = startableAndRunningTasks.filter((task) => task.isStartable());

    if (startableTasks.length === 0) {
      this.log("info", "No startable tasks");
      return [];
    }
    this.log("info", "Startable tasks", { startableTasks: startableTasks.map((task) => task.task.id) });
    return startableTasks;
  }

  private async startEligibleTasks() {
    const eligibleTasks = this.getEligibleStartableTasks();
    for (const task of eligibleTasks) {
      this.log("info", "Starting task", { taskId: task.task.id });
      await this.startTask(task);
      this.log("info", "Started task", { taskId: task.task.id });
    }
  }

  private async startTask(task: TaskManagerInternalTask<Task<any, any, any>>) {
    if (this.startingTasks.has(task) || !task.isStartable()) {
      return;
    }
    this.mutex.runExclusive(async () => {
      // Check again once we have the lock
      if (this.startingTasks.has(task) || !task.isStartable()) {
        return;
      }
      try {
        this.startingTasks.add(task);
        const result = await task.task.start();
      } finally {
        this.startingTasks.delete(task);
      }
    });
  }

  /**
   * This reassesses the running tasks, and requeues any that are running and whose position in the list is >= the concurrentTasks limit
   * This should be called after something happens which may cause tasks to fall out of the top concurrentTasks tasks
   */
  private reassessRunningTasks() {
    // Here we're splitting the tasks - we don't care about the output of the first
    // array but we do need to skip those that are to be left alone
    // The second array is the ones we want to requeue because they are running but fall outside of the
    // concurrentTasks limit
    const { first, last: requeueTasks } = this.priorityItemManager.getSplit(
      this._concurrentTasks,
      (task) => task.isStartable() || task.task.getTaskState() === "running",
      (task) => task.task.getTaskState() === "running" && !task.task.forceRunFlag
    );
    requeueTasks.forEach((task) => {
      task.requeue();
    });
  }

  get concurrentTasks() {
    return this._concurrentTasks;
  }

  set concurrentTasks(concurrentTasks: number) {
    this._concurrentTasks = concurrentTasks;
    this.reassessRunningTasks();
    this.startEligibleTasks();
  }

  async waitForAllTasks(includeCompleted: boolean = false) {
    const tasksArr = Array.from(this.taskMap.values());
    const results: TaskResult<any>[] = [];
    includeCompleted &&
      results.push(
        ...tasksArr
          .filter(({ managedTask }) => managedTask.isCompleted())
          .map(({ managedTask }) => managedTask.finalResult!)
      );
    while (Array.from(this.taskMap.values()).some(({ managedTask }) => !managedTask.isCompleted())) {
      results.push(...(await Promise.all(tasksArr.map(({ managedTask }) => managedTask.awaitResult()))));
    }
    return results;
  }

  /**
   * This will effectively make a paused task eligible for running again, but it will not
   * actually start it as there is no guarantee that the task is eligible given its current position
   * and the concurrentTasks limit.
   * @param taskId
   * @returns
   */
  resumeTask(taskId: string) {
    this.log("debug", `Attempting to resume task ${taskId}`);
    const task = this.taskMap.get(taskId);
    if (!task) {
      return;
    }
    if (task.task.getTaskState() === "paused") {
      this.log("info", `Resuming task ${taskId}`);
      task.task.switchPauseTriggerToAuto();
      this.reassessRunningTasks();
      this.startEligibleTasks();
    }
  }

  getTaskPositionInfo(taskId: string) {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return null;
    }
    return this.priorityItemManager.getItemPositionInfo(task);
  }

  /**
   * Gets a map of task ids to their position info in the task manager's current priority list.
   * @param taskIds
   * @returns
   */
  getTaskPositionInfoMap(taskIds: string[]) {
    const taskMap = new Map<string, PriorityPositionInfo | null>();
    const fullTaskMap = this.priorityItemManager.getItemPositionInfoMap();
    const managedTasks = mapFilterEmpty(taskIds, (taskId) => this.taskMap.get(taskId));
    managedTasks.forEach((managedTask) => {
      taskMap.set(managedTask.task.id, fullTaskMap.get(managedTask) || null);
    });
    return taskMap;
  }

  /**
   * Shifts a task up or down in the task manager's priority list then reassesses running tasks and starts eligible tasks.
   * @param taskId
   */
  shiftTask(taskId: string, direction: "up" | "down", allowPriorityChange: boolean = false) {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return;
    }
    this.priorityItemManager.shiftItem(task, direction, allowPriorityChange);
    this.reassessRunningTasks();
    this.startEligibleTasks();
  }

  /**
   * Changes the priority of a task in the task manager's priority list then reassesses running tasks and starts eligible tasks.
   * @param taskId
   * @param priority
   * @returns
   */
  changeTaskPriority(taskId: string, priority: number) {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return;
    }
    this.priorityItemManager.changePriority(task, priority);
    this.reassessRunningTasks();
    this.startEligibleTasks();
  }

  /**
   * Changes the position of a task in the task manager's priority list then reassesses running tasks and starts eligible tasks.
   * @param taskId
   * @param position
   * @returns
   */
  changeTaskPosition(taskId: string, position: number) {
    const task = this.taskMap.get(taskId);
    if (!task) {
      return;
    }
    this.priorityItemManager.moveNodeToPosition(task, position);
    this.reassessRunningTasks();
    this.startEligibleTasks();
  }

  /**
   * Clear specific tasks from the task manager. Only completed tasks can be cleared.
   * Non-completed tasks will be ignored.
   * @param taskIds
   */
  clearTasks(...taskIds: string[]) {
    this.taskMap.forEach(({ task }) => {
      if (taskIds.includes(task.id) && task.isCompleted()) {
        this.taskMap.delete(task.id);
      }
    });
  }

  /**
   * Clear all completed tasks from the task manager.
   */
  clearCompletedTasks() {
    this.taskMap.forEach(({ task }) => {
      if (task.isCompleted()) {
        this.taskMap.delete(task.id);
      }
    });
  }
}
