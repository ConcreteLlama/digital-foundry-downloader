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
  /**
   * Start this immediately, ignoring a queue hold.
   *
   * Set by a pipeline that was forced, so every later step inherits it - the
   * user asked for one item to be finished, not for its first step to run.
   */
  forceStart?: boolean;
};

/**
 * What force start actually did.
 *
 * `queued_at_front` is not a refusal. A forced task that cannot exceed its
 * manager's limit waits for a slot rather than being turned away, and takes
 * one the moment it frees - it is first in the queue and exempt from the hold
 * that is stopping everything else. There is deliberately no outcome that
 * means "the button did nothing".
 */
export type ForceStartOutcome =
  | "started"
  | "queued_at_front"
  | "already_running"
  | "not_startable"
  | "unknown_task";

/**
 * Priority given to forced work. Lower is sooner and the managers default to 1,
 * so this puts it in front of everything, which is what makes waiting for a
 * slot equivalent to being next.
 */
export const FORCED_PRIORITY = 0;

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
      task.off("taskStateChanged", statusChangedListener);
      task.off("completed", completedListener);
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
    if (opts.forceStart) {
      // A later step of a pipeline the user forced. It inherits the exemption
      // rather than stalling at the first boundary, which is what made the
      // whole thing need hand-cranking.
      this.forceStartTask(task.id);
    } else {
      this.startEligibleTasks();
    }
    return taskWrapper.managedTask;
  }

  /**
   * Gets a list of tasks that are eligible to run.
   * @returns
   */
  /**
   * While held, nothing new starts.
   *
   * A queued task cannot be paused individually - pause() is implemented per
   * task type and does nothing to one that has not begun - so "pause
   * everything" could stop nothing at all: the running task carried on, and
   * the moment it finished the next one started. Holding the queue is the
   * behaviour that was actually wanted, and it belongs here, in the one place
   * that decides what runs next, rather than in every task implementation.
   *
   * Deliberately not persisted. A service restart clears it, which is the
   * safer default for a flag whose failure mode is "nothing ever runs again
   * and nobody remembers why".
   */
  private queueHeld = false;

  /**
   * Individual tasks held back from starting.
   *
   * Pausing something that has not begun has nowhere to go in the task FSM -
   * pause() is implemented per task type and does nothing when there is
   * nothing running - so a queued item could be forced to start but never held
   * back, which is a strange thing to be able to do in only one direction.
   *
   * This is the same mechanism as the queue hold above, narrowed to one task.
   * Anything with actual progress behind it still has to be paused by the task
   * itself; this is only ever about not starting something in the first place.
   */
  private readonly heldTasks = new Set<string>();

  isTaskHeld(taskId: string) {
    return this.heldTasks.has(taskId);
  }

  setTaskHeld(taskId: string, held: boolean) {
    if (held) {
      this.heldTasks.add(taskId);
      return;
    }
    if (this.heldTasks.delete(taskId)) {
      // Releasing has to kick the queue, or nothing runs until some unrelated
      // event next asks for the next task.
      void this.startEligibleTasks();
    }
  }

  isQueueHeld() {
    return this.queueHeld;
  }

  setQueueHeld(held: boolean) {
    if (this.queueHeld === held) {
      return;
    }
    this.queueHeld = held;
    if (!held) {
      // Releasing has to kick the queue: nothing else will happen until some
      // other event asks for the next task, and there may not be one.
      void this.startEligibleTasks();
    }
  }

  getEligibleStartableTasks() {
    const startable = this.selectStartableTasks();
    if (!this.queueHeld) {
      return startable;
    }
    /*
     * A hold stops everything except work that was forced.
     *
     * Forced tasks are given FORCED_PRIORITY, so they sort to the front and are
     * inside the window selectStartableTasks looks at - without that, a forced
     * task sitting tenth in a held queue would never be considered.
     */
    return startable.filter((task) => task.task.forceRunFlag);
  }

  /** How many tasks this manager currently has running. */
  runningTaskCount() {
    return [...this.taskMap.values()].filter((task) => task.task.getTaskState() === "running").length;
  }

  /**
   * Runs a task now if there is room, and puts it first in the queue if not.
   *
   * Goes through startTask rather than calling task.start() directly, which is
   * the whole point of the change: the direct call skipped the mutex, the
   * double-start guard and the manager's own record of the task starting, so
   * the manager's view of what was running diverged from reality.
   */
  forceStartTask(taskId: string): ForceStartOutcome {
    const wrapped = this.taskMap.get(taskId);
    if (!wrapped) {
      return "unknown_task";
    }
    if (wrapped.task.getTaskState() === "running") {
      return "already_running";
    }
    if (!wrapped.isStartable()) {
      return "not_startable";
    }
    /*
     * Forced work jumps the queue and ignores both kinds of hold, but only a
     * task type that has declared headroom may exceed the limit - see
     * TaskOpts.canBreakConcurrency. Downloads may; transcription and analysis
     * may not, because two at once saturates the machine.
     */
    this.heldTasks.delete(taskId);
    this.changeTaskPriority(taskId, FORCED_PRIORITY);
    wrapped.task.forceRunFlag = true;
    const limit = this._concurrentTasks + wrapped.task.canBreakConcurrency;
    if (this.runningTaskCount() >= limit) {
      this.log("info", "Force start queued at the front - no capacity", {
        taskId,
        running: this.runningTaskCount(),
        limit,
      });
      return "queued_at_front";
    }
    void this.startTask(wrapped, true);
    return "started";
  }

  private selectStartableTasks() {
    // We need startable and running as we're basically trying to get the top of the list of
    // tasks that should currently be running
    // Held tasks are passed over rather than filtered out afterwards. Filtering
    // after the fact would let a held task occupy one of the concurrency slots,
    // so holding the one item at the front of a queue running one at a time
    // would stall everything behind it - the opposite of what holding a single
    // item should do.
    const startableAndRunningTasks = this.priorityItemManager.getFirstXItems(
      this._concurrentTasks,
      (task) =>
        ((task.task.forceRunFlag || !this.heldTasks.has(task.task.id)) && task.isStartable()) ||
        task.task.getTaskState() === "running"
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

  private async startTask(task: TaskManagerInternalTask<Task<any, any, any>>, force = false) {
    if (this.startingTasks.has(task) || !task.isStartable()) {
      return;
    }
    // Awaited, unlike before: without it startTask resolved before the task had
    // actually started, so a caller could not tell the difference between
    // started and about to be.
    await this.mutex.runExclusive(async () => {
      // Check again once we have the lock
      if (this.startingTasks.has(task) || !task.isStartable()) {
        return;
      }
      try {
        this.startingTasks.add(task);
        const result = await task.task.start(force);
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
  /**
   * Drop a task that has not started yet.
   *
   * cancel() is implemented per task type and does nothing to a task with
   * nothing running, so cancelling queued work reported success and left it
   * exactly where it was, to start later as if nothing had happened. Removing
   * it from the queue is the only thing that actually stops it.
   *
   * Refuses anything already running - that has a process behind it and has to
   * be cancelled properly, not forgotten about while it carries on.
   */
  dequeueTask(taskId: string): boolean {
    const wrapper = this.taskMap.get(taskId);
    if (!wrapper || wrapper.task.getTaskState() === "running") {
      return false;
    }
    this.priorityItemManager.removeItem(wrapper);
    this.taskMap.delete(taskId);
    return true;
  }

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
