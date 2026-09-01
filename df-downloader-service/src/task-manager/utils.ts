import { TaskControllerTaskBuilder, TaskControls } from "./task/task-controller-task.js";
import { TaskOpts } from "./task/task.js";
import { TaskProgress } from "df-downloader-common";

export const makeTaskControls = <RESULT, ARGS extends any[]>(
  fn: (...args: ARGS) => RESULT | Promise<RESULT>
): TaskControls<RESULT, ARGS> => {
  return {
    start: async (args: ARGS) => {
      const result: RESULT = await fn(...args);
      return {
        status: "success",
        result,
      };
    },
  };
};

export type ProgressReporter = (progress: TaskProgress) => void;

/**
 * taskify for work that can say how far along it is.
 *
 * The plain taskify below uses the argument list itself as the task context,
 * which leaves nowhere to record progress. This wraps the args in an object
 * so there's somewhere mutable to put it, and exposes it through getStatus -
 * which is what surfaces it on the task's status (see TaskProgress).
 *
 * The wrapped function receives a reporter as its first argument; it's free
 * to ignore it.
 *
 * `describe` is how one of these says what it is actually doing, and to what.
 * Without it a task falls back to "In state: success" and shows whatever
 * progress text it last reported - so a queue of them all read identically,
 * naming neither the file nor the outcome. It receives the task's own
 * arguments, which is where the subject lives.
 */
export const taskifyWithProgress = <RESULT, ARGS extends any[]>(
  fn: (onProgress: ProgressReporter, ...args: ARGS) => RESULT | Promise<RESULT>,
    /*
   * describe's args are loose on purpose. Typing them as ARGS makes them an
   * inference site, and a describe naming fewer parameters than the wrapped
   * function takes then narrows ARGS to its own list, breaking every call
   * site that passes the omitted optional arguments. Callers annotate their
   * own parameters, which is where the real types come from.
   */
  opts: Partial<TaskOpts> & { describe?: (state: string, ...args: any[]) => string } = {}
) => {
  const { describe, ...taskOpts } = opts;
  type ProgressContext = { args: ARGS; progress?: TaskProgress };
  const controls: TaskControls<RESULT, ProgressContext> = {
    start: async (context: ProgressContext) => {
      const result = await fn((progress) => {
        context.progress = progress;
      }, ...context.args);
      return {
        status: "success",
        result,
      };
    },
    getStatus: (context: ProgressContext) => ({ progress: context.progress }),
    ...(describe
      ? {
          getStatusMessage: ({ context, state }: { context: ProgressContext; state: string }): string =>
            describe(state, ...context.args),
        }
      : {}),
  };
  const taskType = opts.taskType || `${opts.idPrefix || fn.name}-taskified`;
  const actualOpts: Partial<TaskOpts> = {
    taskType,
    idPrefix: `${opts.idPrefix || fn.name}-taskified`,
    ...taskOpts,
  };
  return (...args: ARGS) => TaskControllerTaskBuilder(controls)({ args }, actualOpts);
};

export const taskify = <RESULT, ARGS extends any[]>(
  fn: (...args: ARGS) => RESULT | Promise<RESULT>,
  opts: Partial<TaskOpts> = {}
) => {
  const controls = makeTaskControls(fn);
  const taskType = opts.taskType || `${opts.idPrefix || fn.name}-taskified`;
  const actualOpts: Partial<TaskOpts> = {
    taskType: taskType,
    idPrefix: `${opts.idPrefix || fn.name}-taskified`,
    ...opts,
  };
  return (...args: ARGS) => TaskControllerTaskBuilder(controls)(args, actualOpts);
};
