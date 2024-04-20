import { PriorityPositionInfo } from "../priority-item-manager.js";
import { ManagedTask } from "../task/task-manager-task.js";
import {
  FinalStep,
  InferTaskResultTuple,
  InferTaskTaskResultTuple,
  InferTaskType,
  PipelineExecutionResult,
  TaskPipelineStep,
} from "./task-pipeline.types.internal.js";

export type BasePipelineExecutionResult<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> = {
  status: "success" | "cancelled" | "failed";
  results: Partial<InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>>;
};

export type PipelineExecutionSuccessResult<
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[],
  PIPELINE_SUCCESS_RESULT_TYPE
> = BasePipelineExecutionResult<TASK_PIPELINE_STEPS> & {
  finalResult: FinalStep<InferTaskResultTuple<TASK_PIPELINE_STEPS>>;
  pipelineResult: PIPELINE_SUCCESS_RESULT_TYPE;
};
export const isPipelineExecutionSuccessResult = <
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[],
  PIPELINE_SUCCESS_RESULT_TYPE
>(
  result: PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE>
): result is PipelineExecutionSuccessResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE> =>
  result.status === "success";

export type PipelineExecutionCancelledResult<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> =
  BasePipelineExecutionResult<TASK_PIPELINE_STEPS> & {
    status: "cancelled";
  };
export const isPipelineExecutionCancelledResult = <TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]>(
  result: PipelineExecutionResult<TASK_PIPELINE_STEPS, any>
): result is PipelineExecutionCancelledResult<TASK_PIPELINE_STEPS> => result.status === "cancelled";

export type PipelineExecutionFailedResult<TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]> =
  BasePipelineExecutionResult<TASK_PIPELINE_STEPS> & {
    status: "failed";
    error: any;
  };
export const isPipelineExecutionFailedResult = <TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, any>[]>(
  result: PipelineExecutionResult<TASK_PIPELINE_STEPS, any>
): result is PipelineExecutionFailedResult<TASK_PIPELINE_STEPS> => result.status === "failed";

export type PipelineStepInfo<TASK_PIPELINE_STEP extends TaskPipelineStep<any, any, any, any>> = {
  step: {
    index: number;
    id: string;
    name: string;
    continueOnFail?: boolean;
    continueOnCancel?: boolean;
  };
  managedTask?: ManagedTask<InferTaskType<TASK_PIPELINE_STEP>>;
  positionInfo?: PriorityPositionInfo | null;
};
