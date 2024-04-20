import { LoggerType } from "../../utils/log.js";
import { TaskManager } from "../task-manager.js";
import { ManagedTask } from "../task/task-manager-task.js";
import { InferTaskResult, InferTaskStatusDetail, InferTaskTaskResult, Task, TaskState } from "../task/task.js";
import {
  PipelineExecutionCancelledResult,
  PipelineExecutionFailedResult,
  PipelineExecutionSuccessResult,
  PipelineStepInfo,
} from "./task-pipeline.types.js";

export type PipelineExecutionResult<
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[],
  PIPELINE_SUCCESS_RESULT_TYPE
> =
  | PipelineExecutionSuccessResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE>
  | PipelineExecutionCancelledResult<TASK_PIPELINE_STEPS>
  | PipelineExecutionFailedResult<TASK_PIPELINE_STEPS>;

export type InferTaskType<TASK_PIPELINE_STEP extends TaskPipelineStep<any, any, any, any>> =
  TASK_PIPELINE_STEP extends TaskPipelineStepNullable<any, any, infer TASK_TYPE, any>
    ? TASK_TYPE | undefined
    : TASK_PIPELINE_STEP extends TaskPipelineStepNonNullable<any, any, infer TASK_TYPE, any>
    ? TASK_TYPE
    : never;

export type InferManagedTaskTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: ManagedTask<InferTaskType<TASK_PIPELINE_STEPS[K]>>;
};
export type InferTaskResultTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: TASK_PIPELINE_STEPS[K] extends TaskPipelineStepNullable<any, any, any, any>
    ? InferTaskResult<InferTaskType<TASK_PIPELINE_STEPS[K]>> | undefined
    : InferTaskResult<InferTaskType<TASK_PIPELINE_STEPS[K]>>;
};
export type InferTaskTaskResultTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: TASK_PIPELINE_STEPS[K] extends TaskPipelineStepNullable<any, any, any, any>
    ? InferTaskTaskResult<InferTaskType<TASK_PIPELINE_STEPS[K]>> | undefined
    : InferTaskTaskResult<InferTaskType<TASK_PIPELINE_STEPS[K]>>;
};
export type InferTaskStatusTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: InferTaskStatusDetail<InferTaskType<TASK_PIPELINE_STEPS[K]>>;
};
export type InferTaskStateTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: InferTaskType<TASK_PIPELINE_STEPS[K]> extends Task<any, any, infer STATE_TYPE>
    ? STATE_TYPE
    : never;
};
export type InferTaskTaskStateTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: TaskState;
};

export type PartialTuple<T extends any[]> = {
  [K in keyof T]: T[K] | undefined;
};

export type TaskCreatorArgs<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS extends any[], PIPELINE_CONTEXT> = {
  context: PIPELINE_CONTEXT;
  previousTaskResult: PREVIOUS_TASK_RESULT;
  allResults: PREVIOUS_TASK_RESULTS;
};

export type TaskPipelineTaskCreatorNonNullable<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> = (args: TaskCreatorArgs<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, PIPELINE_CONTEXT>) => TASK;
export type TaskPipelineTaskCreatorNullable<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> = (args: TaskCreatorArgs<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, PIPELINE_CONTEXT>) => TASK | null;
export type TaskPipelineTaskCreator<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> =
  | TaskPipelineTaskCreatorNonNullable<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT>
  | TaskPipelineTaskCreatorNullable<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT>;

export type BaseTaskPipelineStep<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> = {
  /**
   * The task manager that this task will be executed on.
   */
  readonly taskManager: TaskManager;
  /**
   * A friendly name for the step
   */
  readonly stepName: string;
  /**
   * A flag that indicates if the pipeline should continue if this step is cancelled.
   */
  readonly continueOnFail?: boolean;
  /**
   * A flag that indicates if the pipeline should continue if this step fails.
   */
  readonly continueOnCancel?: boolean;
};
export type TaskPipelineStepNonNullable<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> = BaseTaskPipelineStep<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT> & {
  readonly taskCreator: TaskPipelineTaskCreatorNonNullable<
    PREVIOUS_TASK_RESULT,
    PREVIOUS_TASK_RESULTS,
    TASK,
    PIPELINE_CONTEXT
  >;
};
export type TaskPipelineStepNullable<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> = BaseTaskPipelineStep<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT> & {
  /**
   * A function that creates the task for this step based on the previous task result (if any)
   */
  taskCreator: TaskPipelineTaskCreatorNullable<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT>;
  /**
   * The task manager that this task will be executed on.
   */
  taskManager: TaskManager;
  /**
   * A flag that indicates if the pipeline should continue if this step is cancelled.
   */
  continueOnFail?: boolean;
  /**
   * A flag that indicates if the pipeline should continue if this step fails.
   */
  continueOnCancel?: boolean;
};
export type TaskPipelineStep<
  PREVIOUS_TASK_RESULT,
  PREVIOUS_TASK_RESULTS extends any[],
  TASK extends Task<any, any, any>,
  PIPELINE_CONTEXT
> =
  | TaskPipelineStepNonNullable<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT>
  | TaskPipelineStepNullable<PREVIOUS_TASK_RESULT, PREVIOUS_TASK_RESULTS, TASK, PIPELINE_CONTEXT>;

export type FinalStep<TUPLE extends any[]> = TUPLE extends [...infer REST, infer LAST] ? LAST : never;

export type PipelineStepInfoTuple<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  [K in keyof TASK_PIPELINE_STEPS]: PipelineStepInfo<TASK_PIPELINE_STEPS[K]>;
};

export type TaskPipelineOpts<
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, PIPELINE_CONTEXT>[],
  PIPELINE_CONTEXT,
  PIPELINE_SUCCESS_RESULT_TYPE
> = {
  /**
   * A function that generates a status message for the pipeline based on the current state of the pipeline.
   * @param props
   * @returns
   */
  generateStatusMessage?: (props: {
    steps: PipelineStepInfoTuple<TASK_PIPELINE_STEPS>;
    context: PIPELINE_CONTEXT;
    currentStepIndex: number;
    pipelineResult?: PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE>;
  }) => string | undefined;
  /**
   * A function that reduces the results of the pipeline into a single result object.
   * @param props
   * @returns
   */
  reduceResults: (props: {
    steps: PipelineStepInfoTuple<TASK_PIPELINE_STEPS>;
    context: PIPELINE_CONTEXT;
    results: InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>;
  }) => PIPELINE_SUCCESS_RESULT_TYPE;
};

export type TaskPipelineExecutionOpts = {
  label?: string;
  logger?: LoggerType;
};
