import { FSM, FSMBuilder } from "../../fsm/fsm.js";
import { Task, TaskOpts, TaskResult, TaskState, isTaskResult } from "./task.js";

export type TaskControllerTaskState =
  | "idle"
  | "awaiting_retry"
  | "running"
  | "pausing"
  | "resuming"
  | "paused"
  | "cancelling"
  | "preparing_to_retry"
  | "failed"
  | "cancelled"
  | "success";

export type TaskControllerTaskActionMap<RESULT> = {
  start: undefined;
  resumed: undefined;
  pause: undefined;
  paused: undefined;
  cancel: undefined;
  task_idle: undefined;
  cleaned_up: undefined;
  prepare_for_retry: undefined;
  complete: TaskResult<RESULT>;
};

// TODO:: TaskControls need to take "args" as a parameter for start, which a takcontrollertask will have in
// its context. Then the task controller tasks can all be builders.

type TaskControlsNoPause<RESULT, CONTEXT, STATUS_DETAIL = undefined> = {
  /**
   * Start the task
   * This should not complete or throw an error if the task is paused; pausing
   * should effectively block the start method from completing
   * @returns A promise that resolves to the result of the task
   */
  start: (context: CONTEXT) => Promise<TaskResult<RESULT> | RESULT>;
  getStatusMessage?: (currentState: { context: CONTEXT; state: TaskControllerTaskState }) => string;
  cancel?: (context: CONTEXT) => Promise<void>;
  cleanup?: (context: CONTEXT) => Promise<void>;
} & (STATUS_DETAIL extends undefined
  ? { getStatus?: (context: CONTEXT) => any }
  : { getStatus: (context: CONTEXT) => STATUS_DETAIL });
type TaskControlsPause<RESULT, CONTEXT, STATUS_DETAIL> = TaskControlsNoPause<RESULT, CONTEXT, STATUS_DETAIL> & {
  pause: (context: CONTEXT) => Promise<void>;
  resume: (context: CONTEXT) => Promise<void>;
};
export type TaskControls<RESULT, CONTEXT, STATUS_DETAIL = undefined> =
  | TaskControlsNoPause<RESULT, CONTEXT, STATUS_DETAIL>
  | TaskControlsPause<RESULT, CONTEXT, STATUS_DETAIL>;

const isPausable = <RESULT, CONTEXT, STATUS_DETAIL>(
  controls: TaskControls<RESULT, CONTEXT, STATUS_DETAIL>
): controls is TaskControlsPause<RESULT, CONTEXT, STATUS_DETAIL> => {
  return "pause" in controls && "resume" in controls;
};

export const makeTaskControls = <RESULT, STATUS_DETAIL = undefined>(
  controls: TaskControls<RESULT, STATUS_DETAIL>
): TaskControls<RESULT, STATUS_DETAIL> => {
  return controls;
};

class TaskControllerTaskContext<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined> {
  constructor(
    readonly controlsContext: CONTROLS_CONTEXT,
    readonly resultCallback: (result?: TaskResult<RESULT>) => void
  ) {}

  set result(result: TaskResult<RESULT> | undefined) {
    this.resultCallback(result);
  }
}

const TaskControllerFSMBuilder = <RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined>(
  controls: TaskControls<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>
) => {
  const fsmBuilder = FSMBuilder<
    TaskControllerTaskState,
    TaskControllerTaskActionMap<RESULT>,
    TaskControllerTaskContext<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>
  >({
    initialState: "idle",
    transitions: {
      idle: {
        start: ({ context, dispatch }) => {
          controls
            .start(context.controlsContext)
            .then((result) => {
              dispatch("complete", isTaskResult(result) ? result : { status: "success", result });
            })
            .catch((error) => {
              dispatch("complete", { status: "failed", error });
            });
          return "running";
        },
      },
      awaiting_retry: {
        start: ({ dispatch }) => {
          dispatch("start");
          return "idle";
        },
      },
      running: {
        pause: ({ context, dispatch }) => {
          if (!isPausable(controls)) {
            return "running";
          }
          controls.pause(context.controlsContext).then(() => {
            dispatch("paused");
          });
          return "pausing";
        },
      },
      paused: {
        start: ({ context, dispatch }) => {
          if (!isPausable(controls)) {
            // This should never happen unless someone passed in a bad controls object
            return "paused";
          }
          controls.resume(context.controlsContext).then(() => {
            dispatch("resumed");
          });
          return "resuming";
        },
      },
      resuming: {
        resumed: () => "running",
      },
      pausing: {
        paused: () => "paused",
        task_idle: () => "idle",
      },
      cancelling: {
        // This can only transition to completed which is handled by defaultActionHandlers
        cancel: () => "cancelling",
      },
      success: null,
      cancelled: null,
      preparing_to_retry: {
        cleaned_up: ({ context }) => {
          context.result = undefined;
          return "idle";
        },
      },
      failed: {
        prepare_for_retry: ({ context, dispatch }) => {
          if (controls.cleanup) {
            controls.cleanup(context.controlsContext).then(() => {
              dispatch("cleaned_up");
            });
            return "preparing_to_retry";
          }
          context.result = undefined;
          return "idle";
        },
      },
    },
    defaultActionHandlers: {
      complete: ({ payload, context }) => {
        context.result = payload;
        const toReturn =
          payload.status === "cancelled" ? "cancelled" : payload.status === "failed" ? "failed" : "success";
        return toReturn;
      },
      cleaned_up: () => {
        return "idle";
      },
      cancel: ({ context, dispatch, currentState }) => {
        if (controls.cancel) {
          controls.cancel(context.controlsContext).then(() => {
            dispatch("complete", { status: "cancelled" });
          });
          return "cancelling";
        } else {
          return currentState;
        }
      },
    },
  });
  return fsmBuilder;
};
type TaskControllerFSMBuilderFn<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined> = ReturnType<
  typeof TaskControllerFSMBuilder<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>
>;
type TaskControllerFSM<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined> = FSM<
  TaskControllerTaskState,
  TaskControllerTaskActionMap<RESULT>,
  TaskControllerTaskContext<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>
>;

export const TaskControllerTaskBuilder = <RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined>(
  controls: TaskControls<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>,
  defaultOpts: Partial<TaskOpts> = {}
) => {
  const fsmBuilder = TaskControllerFSMBuilder(controls);
  return (controlsContext: CONTROLS_CONTEXT, opts: Partial<TaskOpts> = {}) => {
    return new TaskControllerTask<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>(controls, controlsContext, fsmBuilder, {
      ...defaultOpts,
      ...opts,
    });
  };
};

export class TaskControllerTask<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL = undefined> extends Task<
  RESULT,
  STATUS_DETAIL,
  TaskControllerTaskState
> {
  private fsm: TaskControllerFSM<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>;

  constructor(
    private readonly controls: TaskControls<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>,
    private readonly controlsContext: CONTROLS_CONTEXT,
    fsmBuilder: TaskControllerFSMBuilderFn<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>,
    taskOpts: Partial<TaskOpts> = {}
  ) {
    super({
      taskType: "task-controller",
      ...taskOpts,
    });
    this.fsm = fsmBuilder(
      new TaskControllerTaskContext<RESULT, CONTROLS_CONTEXT, STATUS_DETAIL>(controlsContext, (result) => {
        result && this.setResult(result);
      }),
      {
        label: `${this.id}-FSM`,
      }
    );
    this.fsm.on("stateChanged", (state) => {
      this.emit("stateChanged", this.stateToTaskState(state));
    });
  }

  get state() {
    return this.fsm.currentState;
  }

  async awaitResult(): Promise<TaskResult<RESULT>> {
    return await new Promise<TaskResult<RESULT>>((resolve) => {
      if (this.result) {
        return this.result;
      }
      this.once("completed", (result) => {
        resolve(result);
      });
    });
  }

  isPausable() {
    return isPausable(this.controls);
  }

  protected startInternal() {
    return this.fsm.dispatch("start");
  }

  protected pauseInternal() {
    return this.fsm.dispatch("pause");
  }

  protected resumeInternal() {
    return this.fsm.dispatch("start");
  }

  protected cancelInternal() {
    return this.fsm.dispatch("cancel");
  }

  public stateToTaskState(state: TaskControllerTaskState): TaskState {
    switch (state) {
      case "idle":
        return "idle";
      case "paused":
        return "paused";
      case "failed":
      case "preparing_to_retry":
        return "failed";
      case "cancelled":
        return "cancelled";
      case "success":
        return "success";
      case "awaiting_retry":
        return "awaiting_retry";
      case "pausing":
        return "pausing";
      case "cancelling":
        return "cancelling";
      default:
        return "running";
    }
  }

  getInternalState(): TaskControllerTaskState {
    return this.fsm.currentState;
  }

  getStatus(): STATUS_DETAIL {
    const controlsAny = this.controls as any;
    return controlsAny.getStatus ? controlsAny.getStatus(this.controlsContext) : undefined;
  }

  async cleanup() {
    this.controls.cleanup?.(this.controlsContext);
    return this.stateToTaskState(this.fsm.currentState);
  }

  prepareForRetry() {
    return this.fsm.dispatch("prepare_for_retry");
  }

  getStatusMessage(): string {
    return this.controls.getStatusMessage
      ? this.controls.getStatusMessage({
          context: this.controlsContext,
          state: this.stateToTaskState(this.fsm.currentState),
        })
      : `In state: ${this.getTaskState()}`;
  }
}
