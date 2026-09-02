import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { makeRunUniqueId } from "../../utils/run-id.js";
import { LoggerType, makeLogger } from "../../utils/log.js";

export type TaskSuccessfulResult<RESULT> = {
  status: "success";
  result: RESULT;
};
export const isTaskSuccessfulResult = <RESULT>(result: TaskResult<RESULT>): result is TaskSuccessfulResult<RESULT> =>
  result.status === "success";
export type TaskFailedResult = {
  status: "failed";
  error: any;
};
export const isTaskFailedResult = <RESULT>(result: TaskResult<RESULT>): result is TaskFailedResult =>
  result.status === "failed";
export type TaskCancelledResult = {
  status: "cancelled";
};
export const isTaskCancelledResult = <RESULT>(result: TaskResult<RESULT>): result is TaskCancelledResult =>
  result.status === "cancelled";
export type TaskResult<RESULT> = TaskSuccessfulResult<RESULT> | TaskFailedResult | TaskCancelledResult;
export const isTaskResult = <RESULT>(result: any): result is TaskResult<RESULT> =>
  isTaskSuccessfulResult(result) || isTaskFailedResult(result) || isTaskCancelledResult(result);

export type TaskEvents<RESULT, STATE_TYPE> = {
  completed: TaskResult<RESULT>;
  started: undefined;
  stateChanged: STATE_TYPE;
  taskStateChanged: TaskState;
  forceRunFlagChanged: boolean;
};
export type RetryFn = (attempt: number) => number | null;
export type TaskOpts = {
  taskType: string;
  idPrefix?: string;
  logger?: LoggerType;
  /**
   * How many extra of this task may run beyond its manager's limit when forced.
   *
   * Zero for everything except downloads, deliberately. Force start began as a
   * download gesture where one more transfer is harmless, but the same button
   * now sits on transcription and analysis, which saturate the machine - two at
   * once is a real problem rather than a slower queue.
   *
   * A number rather than a flag so it stays bounded: forcing several downloads
   * must not open several extra connections to a site this app is deliberately
   * gentle with.
   *
   * This is separate from being exempt from a queue hold. A forced pipeline
   * ignores the hold on every manager it touches; only this decides whether it
   * may also exceed a limit.
   */
  canBreakConcurrency?: number;
};
export type InferTaskTaskResult<TASK> = TaskResult<TASK extends Task<infer RESULT, any, any> ? RESULT : never>;
export type InferTaskResult<TASK> = TASK extends Task<infer RESULT, any, any> ? RESULT : never;
export type InferTaskStatusDetail<TASK> = TASK extends Task<any, infer STATUS_DETAIL, any> ? STATUS_DETAIL : never;

export const taskStates = [
  "idle",
  "awaiting_retry",
  "running",
  "pausing",
  "paused",
  "cancelling",
  "cancelled",
  "failed",
  "success",
] as const;
export type TaskState = (typeof taskStates)[number];

export type PauseTrigger = "manual" | "auto";

export abstract class Task<
  RESULT,
  STATUS_DETAIL,
  STATE_TYPE,
  EVENTS extends TaskEvents<RESULT, STATE_TYPE> = TaskEvents<RESULT, STATE_TYPE>
> extends CachedEventEmitter<EVENTS> {
  protected _result: TaskResult<RESULT> | undefined;
  readonly taskType: string;
  /** See TaskOpts.canBreakConcurrency. Zero unless a task type opts in. */
  readonly canBreakConcurrency: number;
  public readonly id: string;
  private lastTaskState: TaskState = "idle";
  protected log: LoggerType;
  private _pauseTrigger: PauseTrigger | null = null;
  private pauseTriggerInProgress: PauseTrigger | null = null;
  private _forceRunFlag: boolean = false;
  private _startTime: Date | null = null;
  private _endTime: Date | null = null;
  /**
   * Working time, as a two-scalar stopwatch - see TaskStatus.accumulatedActiveMs.
   *
   * Separate from _startTime, which is wall clock and deliberately keeps
   * running while paused. This one stops, so throughput has something honest
   * to divide by and a paused row can say "Elapsed 6m 29s - Active 2m 14s".
   */
  private _accumulatedActiveMs = 0;
  private _lastResumedAt: Date | null = null;
  private startedEmitted: boolean = false;

  constructor({ idPrefix, taskType, logger, canBreakConcurrency }: TaskOpts) {
    super();
    this.log = makeLogger(`task:${taskType}`, logger);
    this.taskType = taskType;
    this.canBreakConcurrency = canBreakConcurrency ?? 0;
    this.id = makeRunUniqueId(idPrefix || `${taskType}-task-`);
    this.on("stateChanged", (state) => {
      const taskState = this.stateToTaskState(state);
      // Stopwatch: start counting on every entry to running, bank the interval
      // on every departure from it. Driven off the same transition as the rest
      // of the state bookkeeping so it cannot drift out of step with what the
      // task reports.
      if (taskState === "running" && !this._lastResumedAt) {
        this._lastResumedAt = new Date();
      } else if (taskState !== "running" && this._lastResumedAt) {
        this._accumulatedActiveMs += Date.now() - this._lastResumedAt.getTime();
        this._lastResumedAt = null;
      }
      if (taskState === "running") {
        if (!this.startedEmitted) {
          this.startedEmitted = true;
          // First transition to running only - a task that pauses and
          // resumes keeps its original start, so elapsed time reflects how
          // long the step has actually been going rather than restarting.
          this._startTime = new Date();
          this.emit("started", undefined);
        }
      }
      this.log("debug", `${this.id} state changed to ${state} (taskState: ${taskState})`);
      if (taskState !== this.lastTaskState) {
        if (taskState === "paused" && this.pauseTriggerInProgress) {
          this._pauseTrigger = this.pauseTriggerInProgress;
          this.pauseTriggerInProgress = null;
        } else if (!this.pauseTriggerInProgress) {
          this._pauseTrigger = null;
        }
        this.lastTaskState = taskState;
        this.emit("taskStateChanged", taskState);
      }
    });
  }

  get forceRunFlag() {
    return this._forceRunFlag;
  }

  set forceRunFlag(value: boolean) {
    if (this._forceRunFlag !== value) {
      this._pauseTrigger = null;
      this._forceRunFlag = value;
      this.emit("forceRunFlagChanged", value);
    }
  }

  get pauseTrigger() {
    return this._pauseTrigger;
  }

  switchPauseTriggerToAuto() {
    if (this._pauseTrigger === "manual") {
      this._pauseTrigger = "auto";
    }
  }

  get result() {
    return this._result;
  }

  get startTime() {
    return this._startTime;
  }

  get endTime() {
    return this._endTime;
  }

  /** Banked working time, excluding any interval currently in progress. */
  get accumulatedActiveMs() {
    return this._accumulatedActiveMs;
  }

  /** When the current working interval began, or null if not running. */
  get lastResumedAt() {
    return this._lastResumedAt;
  }

  protected setResult(result: TaskResult<RESULT>) {
    this._result = result;
    this._endTime = new Date();
    this.emit("completed", result);
  }

  isCompleted(): boolean {
    const taskState = this.stateToTaskState(this.getInternalState());
    return taskState === "cancelled" || taskState === "success" || taskState === "failed";
  }

  getTaskState() {
    return this.stateToTaskState(this.getInternalState());
  }

  abstract getStatusMessage(): string;

  abstract stateToTaskState(state: STATE_TYPE): TaskState;

  abstract getInternalState(): STATE_TYPE;

  pause(trigger: PauseTrigger) {
    this.pauseTriggerInProgress = trigger;
    return this.pauseInternal();
  }
  start(force?: boolean) {
    this.forceRunFlag = force === true;
    return this.startInternal();
  }
  resume() {
    return this.resumeInternal();
  }
  cancel() {
    return this.cancelInternal();
  }
  protected abstract startInternal(): Promise<STATE_TYPE>;
  protected abstract pauseInternal(): Promise<STATE_TYPE>;
  protected abstract resumeInternal(): Promise<STATE_TYPE>;
  protected abstract cancelInternal(): Promise<STATE_TYPE>;

  abstract prepareForRetry(): Promise<STATE_TYPE>;
  abstract cleanup(): Promise<STATE_TYPE>;

  abstract getStatus(): STATUS_DETAIL;
  abstract awaitResult(): Promise<TaskResult<RESULT>>;
}
