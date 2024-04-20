import { TaskPipelineBuilder } from "./task-pipeline-builder.js";
import { TaskPipelineExecution } from "./task-pipeline-execution.js";
import { TaskPipelineExecutionOpts, TaskPipelineOpts, TaskPipelineStep } from "./task-pipeline.types.internal.js";

export class TaskPipeline<
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, PIPELINE_CONTEXT>[],
  PIPELINE_CONTEXT,
  PIPELINE_TYPE extends string,
  PIPELINE_SUCCESS_RESULT_TYPE
> {
  constructor(
    readonly pipelineType: PIPELINE_TYPE,
    readonly tasksPipelineSteps: TASK_PIPELINE_STEPS,
    readonly opts: TaskPipelineOpts<TASK_PIPELINE_STEPS, PIPELINE_CONTEXT, PIPELINE_SUCCESS_RESULT_TYPE>
  ) {}
  start(context: PIPELINE_CONTEXT, executionOpts: TaskPipelineExecutionOpts = {}) {
    const toReturn = new TaskPipelineExecution(
      this.pipelineType,
      context,
      this.tasksPipelineSteps,
      this.opts,
      executionOpts
    );
    toReturn.start();
    return toReturn;
  }
}

/**
 * Creates a task pipeline. A task pipeline is a sequence of tasks that are executed in order,
 * with the output of each task being passed to the next task. Once all tasks are completed,
 * the pipeline is considered complete. A failing task will cause the pipeline to fail
 * unless the step is set to continue on failure.
 *
 * Once a task pipeline is created, it is reusable and can be started multiple times with different contexts.
 * @param pipelineType
 * @returns
 */
export const makeTaskPipeline = <PIPELINE_CONTEXT, PIPELINE_TYPE extends string = string>(
  pipelineType: PIPELINE_TYPE
) => new TaskPipelineBuilder<undefined, [], PIPELINE_CONTEXT, PIPELINE_TYPE>(pipelineType);
