import { makeErrorMessage } from "df-downloader-common";
import _ from "lodash";
import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { LoggerType, makeLogger } from "../../utils/log.js";
import { ManagedTask } from "../task/task-manager-task.js";
import { InferTaskTaskResult, Task, isTaskCancelledResult, isTaskFailedResult } from "../task/task.js";
import {
  InferManagedTaskTuple,
  InferTaskResultTuple,
  InferTaskStateTuple,
  InferTaskStatusTuple,
  InferTaskTaskResultTuple,
  InferTaskTaskStateTuple,
  InferTaskType,
  PartialTuple,
  PipelineExecutionResult,
  PipelineStepInfoTuple,
  TaskPipelineExecutionOpts,
  TaskPipelineOpts,
  TaskPipelineStep,
} from "./task-pipeline.types.internal.js";
import { PipelineStepInfo } from "./task-pipeline.types.js";

/**
 * A task pipeline execution is a running instance of a task pipeline. It is responsible for
 * executing the tasks in the pipeline in order, passing the output of each task to the next task.
 * It emits events for each task completion and when the pipeline is completed.
 */
export class TaskPipelineExecution<
  TASK_PIPELINE_STEPS extends TaskPipelineStep<any, any, any, PIPELINE_CONTEXT>[],
  PIPELINE_CONTEXT,
  PIPELINE_TYPE extends string,
  PIPELINE_SUCCESS_RESULT_TYPE
> extends CachedEventEmitter<{
  completed: PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE>;
  stepCompleted: {
    index: number;
    result: InferTaskTaskResult<InferTaskType<TASK_PIPELINE_STEPS[number]>>;
  };
  stepTaskStarted: {
    index: number;
    task: ManagedTask<InferTaskType<TASK_PIPELINE_STEPS[number]>>;
  };
}> {
  readonly results: PartialTuple<InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>>;
  private readonly tasks: PartialTuple<InferManagedTaskTuple<TASK_PIPELINE_STEPS>>;
  private _pipelineResult: PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE> | undefined;
  private currentStepIndex = 0;
  private started: boolean = false;
  readonly id: string;
  private _startTime?: Date;
  private log: LoggerType;
  constructor(
    readonly pipelineType: PIPELINE_TYPE,
    readonly context: PIPELINE_CONTEXT,
    readonly pipelineSteps: TASK_PIPELINE_STEPS,
    readonly pipelineOpts: TaskPipelineOpts<TASK_PIPELINE_STEPS, PIPELINE_CONTEXT, PIPELINE_SUCCESS_RESULT_TYPE>,
    executionOpts: TaskPipelineExecutionOpts = {}
  ) {
    super();
    this.results = pipelineSteps.map(() => undefined) as any;
    this.tasks = pipelineSteps.map(() => undefined) as any;
    const label = executionOpts.label || `${pipelineType}-pipeline`;
    this.id = _.uniqueId(`${label}-`);
    this.log = makeLogger(this.id, executionOpts.logger);
    this.once("completed", (result) => {
      this.log("info", `Pipeline ${this.id} completed with status ${result.status}`);
      this._pipelineResult = result;
    });
  }

  get pipelineResult() {
    return this._pipelineResult;
  }

  get isCompleted() {
    return Boolean(this._pipelineResult);
  }

  get startTime() {
    return this._startTime;
  }

  private runNextTask(previousResult: any, index: number) {
    this.log("info", "Running next task", { index });
    const pipelineStep = this.pipelineSteps[index];
    if (!pipelineStep) {
      return;
    }
    const task: Task<any, any, any> = pipelineStep.taskCreator({
      context: this.context,
      previousTaskResult: previousResult,
      allResults: this.results,
    });
    if (!task) {
      this.log("info", `Task step ${index} ("${pipelineStep.stepName}") returned null, skipping`);
      if (index === this.pipelineSteps.length - 1) {
        this.emit("completed", {
          status: "success",
          results: this.results,
          finalResult: undefined as any,
          // TODO: Remove the as any here and correctly type
          pipelineResult: this.reduceResults() as any,
        });
      } else {
        this.runNextTask(undefined, ++this.currentStepIndex);
      }
      return;
    }
    const managedTask = pipelineStep.taskManager.addTask(task);
    this.tasks[index] = managedTask;
    managedTask.task.once("started", () => {
      this.emit("stepTaskStarted", { index, task: managedTask as any });
    });
    managedTask.once("taskCompleted", ({ result }) => {
      this.log("info", `Got completed event for task ${index} ("${pipelineStep.stepName}")`);
      this.emit("stepCompleted", { index, result: result as any });
      this.results[index] = result;
      if (isTaskCancelledResult(result)) {
        if (pipelineStep.continueOnCancel) {
          this.log(
            "info",
            `Task ${index} ("${pipelineStep.stepName}") was cancelled but pipeline step is configured to continue on cancel`
          );
          this.runNextTask(undefined, ++this.currentStepIndex);
        } else {
          this.emit("completed", {
            status: "cancelled",
            results: this.results,
          });
        }
      } else if (isTaskFailedResult(result)) {
        if (pipelineStep.continueOnFail) {
          this.log(
            "info",
            `Task ${index} ("${pipelineStep.stepName}") failed but pipeline step is configured to continue on fail`
          );
          this.runNextTask(undefined, ++this.currentStepIndex);
        } else {
          this.emit("completed", {
            status: "failed",
            results: this.results,
            error: result.error,
          });
        }
      } else if (index === this.pipelineSteps.length - 1) {
        this.log("info", `Index ${index} ("${pipelineStep.stepName}") is last task, emitting completed event`);
        this.emit("completed", {
          status: "success",
          results: this.results,
          finalResult: result.result,
          // TODO: Remove the as any here and correctly type
          pipelineResult: this.reduceResults() as any,
        });
      } else {
        this.runNextTask(result.result, ++this.currentStepIndex);
      }
    });
  }

  private makeStepId(index: number) {
    return `${this.id}-step-${index}`;
  }

  getStep(index: number, includePositionInfo?: boolean): PipelineStepInfo<TASK_PIPELINE_STEPS[number]> {
    const task = this.tasks[index];
    const step = this.pipelineSteps[index];
    return {
      step: {
        index: index,
        id: this.makeStepId(index),
        name: step.stepName,
        continueOnFail: step.continueOnFail,
        continueOnCancel: step.continueOnCancel,
      },
      managedTask: this.tasks[index],
      positionInfo: task && includePositionInfo ? step.taskManager.getTaskPositionInfo(task.task.id) : undefined,
    };
  }

  getStepById(id: string, includePositionInfo?: boolean): PipelineStepInfo<TASK_PIPELINE_STEPS[number]> {
    // TODO: Refactor the way pipeline steps have IDs
    const index = this.pipelineSteps.findIndex((step, index) => this.makeStepId(index) === id);
    if (index === -1) {
      throw new Error(`No step found with id ${id}`);
    }
    return this.getStep(index, includePositionInfo);
  }

  getSteps(includePositionInfo?: boolean): PipelineStepInfoTuple<TASK_PIPELINE_STEPS> {
    return this.pipelineSteps.map((_, index) =>
      this.getStep(index, includePositionInfo)
    ) as PipelineStepInfoTuple<TASK_PIPELINE_STEPS>;
  }

  getCurrentStep(): PipelineStepInfo<TASK_PIPELINE_STEPS[number]> {
    return this.getStep(this.currentStepIndex);
  }

  getStatuses() {
    return this.tasks.map((task) => {
      return task?.task?.getStatus();
    }) as PartialTuple<InferTaskStatusTuple<TASK_PIPELINE_STEPS>>;
  }

  getStates() {
    return this.tasks.map((task) => {
      return task?.task?.getState();
    }) as PartialTuple<InferTaskStateTuple<TASK_PIPELINE_STEPS>>;
  }

  getTaskStates() {
    return this.tasks.map((task) => {
      return task?.task?.getTaskState();
    }) as PartialTuple<InferTaskTaskStateTuple<TASK_PIPELINE_STEPS>>;
  }

  start() {
    this.log("info", "Starting task pipeline");
    if (this.started) {
      throw new Error("Task pipeline already started");
    }
    this._startTime = new Date();
    this.started = true;
    this.runNextTask(undefined, 0);
  }

  async getSuccessResults() {
    return this.results.map((result) => {
      if (result?.status === "success") {
        return result.result;
      }
    }) as PartialTuple<InferTaskResultTuple<TASK_PIPELINE_STEPS>>;
  }

  async awaitResult() {
    this.log("info", "Awaiting result");
    const result = await new Promise<PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE>>(
      (resolve) => {
        this.once("completed", (result) => {
          this.log("info", "Got completed event", { result });
          resolve(result);
        });
      }
    );
    this.log("info", "Returning result", { result });
    return result;
  }

  generateStatusMessage() {
    const lastTask = this.tasks[this.tasks.length - 1];
    const lastTaskResult = lastTask?.finalResult;
    const lastTaskError = lastTaskResult?.status === "failed" ? makeErrorMessage(lastTaskResult.error) : undefined;
    return (
      this.pipelineOpts.generateStatusMessage?.({
        steps: this.getSteps(),
        context: this.context,
        currentStepIndex: this.currentStepIndex,
        pipelineResult: this.pipelineResult,
      }) ||
      this.tasks[this.currentStepIndex]?.task?.getStatusMessage() ||
      lastTaskError ||
      this.pipelineResult?.status ||
      `In step ${this.pipelineSteps[this.currentStepIndex]?.stepName}` ||
      `Idle`
    );
  }
  private reduceResults(): PIPELINE_SUCCESS_RESULT_TYPE {
    return this.pipelineOpts.reduceResults?.({
      steps: this.getSteps(),
      context: this.context,
      results: this.results as InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>,
    })!;
  }
}
