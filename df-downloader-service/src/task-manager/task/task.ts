import _ from "lodash";
import { CachedEventEmitter } from "../../utils/event-emitter.js";
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
  public readonly id: string;
  private lastTaskState: TaskState = "idle";
  protected log: LoggerType;
  private _pauseTrigger: PauseTrigger | null = null;
  private pauseTriggerInProgress: PauseTrigger | null = null;
  private _forceRunFlag: boolean = false;
  private _endTime: Date | null = null;
  private startedEmitted: boolean = false;

  constructor({ idPrefix, taskType, logger }: TaskOpts) {
    super();
    this.log = makeLogger(`task:${taskType}`, logger);
    this.taskType = taskType;
    this.id = _.uniqueId(idPrefix || `${taskType}-task-`);
    this.on("stateChanged", (state) => {
      const taskState = this.stateToTaskState(state);
      if (taskState === "running") {
        if (!this.startedEmitted) {
          this.startedEmitted = true;
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

  get endTime() {
    return this._endTime;
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
