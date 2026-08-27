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
 */
export const taskifyWithProgress = <RESULT, ARGS extends any[]>(
  fn: (onProgress: ProgressReporter, ...args: ARGS) => RESULT | Promise<RESULT>,
  opts: Partial<TaskOpts> = {}
) => {
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
  };
  const taskType = opts.taskType || `${opts.idPrefix || fn.name}-taskified`;
  const actualOpts: Partial<TaskOpts> = {
    taskType,
    idPrefix: `${opts.idPrefix || fn.name}-taskified`,
    ...opts,
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
