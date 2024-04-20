import { TaskControllerTaskBuilder, TaskControls } from "./task/task-controller-task.js";
import { TaskOpts } from "./task/task.js";

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
