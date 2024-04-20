import { InferTaskResult, Task } from "../task/task.js";
import { TaskPipeline } from "./task-pipeline.js";
import {
  InferTaskTaskResultTuple,
  TaskPipelineOpts,
  TaskPipelineStep,
  TaskPipelineStepNonNullable,
  TaskPipelineStepNullable,
} from "./task-pipeline.types.internal.js";

export class TaskPipelineBuilder<
  LAST_TASK_RESULT,
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, PIPELINE_CONTEXT>[],
  PIPELINE_CONTEXT,
  PIPELINE_TYPE extends string
> {
  readonly pipelineType: PIPELINE_TYPE;
  readonly tasksPipelineSteps: TASK_PIPELINE_STEPS;
  constructor(pipelineType: PIPELINE_TYPE, ...previousTasks: TASK_PIPELINE_STEPS) {
    this.tasksPipelineSteps = previousTasks;
    this.pipelineType = pipelineType;
  }

  // Overloads - if continueOnFail or continueOnCancel are set, or the taskCreator is capable of returning null, the next task result may be undefined
  next<TASK extends Task<any, any, any>>(
    pipelineStep: TaskPipelineStep<
      LAST_TASK_RESULT,
      InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>,
      TASK,
      PIPELINE_CONTEXT
    > &
      (
        | {
            continueOnFail: true;
          }
        | {
            continueOnCancel: true;
          }
      )
  ): TaskPipelineBuilder<
    InferTaskResult<TASK> | undefined,
    [
      ...TASK_PIPELINE_STEPS,
      TaskPipelineStep<LAST_TASK_RESULT, InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>, TASK, PIPELINE_CONTEXT>
    ],
    PIPELINE_CONTEXT,
    PIPELINE_TYPE
  >;
  next<TASK extends Task<any, any, any>>(
    pipelineStep: TaskPipelineStepNonNullable<
      LAST_TASK_RESULT,
      InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>,
      TASK,
      PIPELINE_CONTEXT
    >
  ): TaskPipelineBuilder<
    InferTaskResult<TASK>,
    [
      ...TASK_PIPELINE_STEPS,
      TaskPipelineStep<LAST_TASK_RESULT, InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>, TASK, PIPELINE_CONTEXT>
    ],
    PIPELINE_CONTEXT,
    PIPELINE_TYPE
  >;
  next<TASK extends Task<any, any, any>>(
    pipelineStep: TaskPipelineStepNullable<
      LAST_TASK_RESULT,
      InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>,
      TASK,
      PIPELINE_CONTEXT
    >
  ): TaskPipelineBuilder<
    InferTaskResult<TASK> | undefined,
    [
      ...TASK_PIPELINE_STEPS,
      TaskPipelineStep<LAST_TASK_RESULT, InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>, TASK, PIPELINE_CONTEXT>
    ],
    PIPELINE_CONTEXT,
    PIPELINE_TYPE
  >;
  next<TASK extends Task<any, any, any>>(
    pipelineStep: TaskPipelineStep<
      LAST_TASK_RESULT,
      InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>,
      TASK,
      PIPELINE_CONTEXT
    >
  ): TaskPipelineBuilder<
    InferTaskResult<TASK>,
    [
      ...TASK_PIPELINE_STEPS,
      TaskPipelineStep<LAST_TASK_RESULT, InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>, TASK, PIPELINE_CONTEXT>
    ],
    PIPELINE_CONTEXT,
    PIPELINE_TYPE
  > {
    this.tasksPipelineSteps.push(pipelineStep);
    return this as any;
  }

  build<
    TASK_PIPELINE_OPTS extends TaskPipelineOpts<TASK_PIPELINE_STEPS, PIPELINE_CONTEXT, any>,
    PIPELINE_SUCCESS_RESULT_TYPE = ReturnType<TASK_PIPELINE_OPTS["reduceResults"]>
  >(opts: TASK_PIPELINE_OPTS) {
    return new TaskPipeline<TASK_PIPELINE_STEPS, PIPELINE_CONTEXT, PIPELINE_TYPE, PIPELINE_SUCCESS_RESULT_TYPE>(
      this.pipelineType,
      this.tasksPipelineSteps,
      opts
    );
  }
}
