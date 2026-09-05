import { makeErrorMessage } from "df-downloader-common";
import { CachedEventEmitter } from "../../utils/event-emitter.js";
import { makeRunUniqueId } from "../../utils/run-id.js";
import { LoggerType, makeLogger } from "../../utils/log.js";
import { FORCED_PRIORITY, ForceStartOutcome } from "../task-manager.js";
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
  isChildPipelineStep,
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
  /**
   * A nested step has started a pipeline of its own.
   *
   * Announced rather than registered here, because this layer knows nothing
   * about DfTaskManager and should not: the app layer listens and tracks the
   * child exactly as it tracks any pipeline, which is what makes a nested
   * transcription appear on the Activity page in its own right rather than
   * being hidden inside whatever started it.
   */
  childPipelineStarted: {
    index: number;
    execution: TaskPipelineExecution<any, any, any, any>;
  };
}> {
  readonly results: PartialTuple<InferTaskTaskResultTuple<TASK_PIPELINE_STEPS>>;
  private readonly tasks: PartialTuple<InferManagedTaskTuple<TASK_PIPELINE_STEPS>>;
  /**
   * Child pipelines started by nested steps, by step index.
   *
   * Held so cancel and force can reach them. A nested step has no entry in
   * `tasks` - it owns no task of its own - so anything walking steps has to
   * look here as well.
   */
  private readonly childExecutions: (TaskPipelineExecution<any, any, any, any> | undefined)[];
  private _pipelineResult: PipelineExecutionResult<TASK_PIPELINE_STEPS, PIPELINE_SUCCESS_RESULT_TYPE> | undefined;
  private currentStepIndex = 0;
  /**
   * Sticky once set: every remaining step ignores the queue hold.
   *
   * Deliberately for the life of the pipeline rather than one step. The user
   * asked for this item to be finished while everything is paused, and a flag
   * that expired at the next boundary is exactly what forced them to press the
   * button again at every step.
   */
  private forceRun = false;
  /**
   * Someone asked this pipeline to stop, whether or not anything could act on
   * it yet.
   *
   * Needed because cancelling a running task is a per-type capability that
   * most types do not implement: `cancel()` returns cleanly, the step runs to
   * completion anyway, and without this the pipeline would then advance to its
   * next step - so pressing Stop produced a finished pipeline. The work that
   * was already in flight cannot be unmade, but nothing new starts after it.
   */
  private cancelRequested = false;
  private started: boolean = false;
  readonly id: string;
  private _startTime?: Date;
  private log: LoggerType;
  constructor(
    readonly pipelineType: PIPELINE_TYPE,
    readonly context: PIPELINE_CONTEXT,
    readonly pipelineSteps: TASK_PIPELINE_STEPS,
    readonly pipelineOpts: TaskPipelineOpts<TASK_PIPELINE_STEPS, PIPELINE_CONTEXT, PIPELINE_SUCCESS_RESULT_TYPE>,
    private readonly executionOpts: TaskPipelineExecutionOpts = {}
  ) {
    super();
    this.results = pipelineSteps.map(() => undefined) as any;
    this.tasks = pipelineSteps.map(() => undefined) as any;
    this.childExecutions = pipelineSteps.map(() => undefined);
    const label = executionOpts.label || `${pipelineType}-pipeline`;
    this.id = makeRunUniqueId(`${label}-`);
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

  /**
   * What a step does when it finishes, whichever kind of step it is.
   *
   * Pulled out of the task path so a nested pipeline gets identical treatment:
   * continueOnFail and continueOnCancel are the parent's policy about a step,
   * and it would be a trap for them to mean one thing for a task and another
   * for a child pipeline.
   */
  private handleStepResult(index: number, result: any, stepName: string) {
    this.emit("stepCompleted", { index, result: result as any });
    this.results[index] = result;
    const pipelineStep = this.pipelineSteps[index];
    if (this.cancelRequested) {
      this.log("info", `Step ${index} ("${stepName}") finished after a stop was requested - not continuing`);
      this.emit("completed", { status: "cancelled", results: this.results });
      return;
    }
    if (isTaskCancelledResult(result)) {
      if (pipelineStep.continueOnCancel) {
        this.log("info", `Task ${index} ("${stepName}") was cancelled but pipeline step is configured to continue on cancel`);
        this.runNextTask(undefined, ++this.currentStepIndex);
      } else {
        this.emit("completed", { status: "cancelled", results: this.results });
      }
    } else if (isTaskFailedResult(result)) {
      if (pipelineStep.continueOnFail) {
        this.log("info", `Task ${index} ("${stepName}") failed but pipeline step is configured to continue on fail`);
        this.runNextTask(undefined, ++this.currentStepIndex);
      } else {
        this.emit("completed", { status: "failed", results: this.results, error: result.error });
      }
    } else if (index === this.pipelineSteps.length - 1) {
      this.log("info", `Index ${index} ("${stepName}") is last task, emitting completed event`);
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
  }

  /** Nothing to run here - move on, or finish if this was the last step. */
  private skipStep(index: number, stepName: string) {
    this.log("info", `Task step ${index} ("${stepName}") returned null, skipping`);
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
  }

  /**
   * Runs a nested pipeline as if it were a task.
   *
   * The child is constructed and started here rather than through a manager,
   * so it holds no running slot anywhere - its own steps queue in their proper
   * managers exactly as they do when that pipeline is run on its own. Priority
   * and the forced flag are handed down, or forcing a download would stop dead
   * at the first nested boundary, which is the bug the sticky forceRun flag
   * exists to prevent.
   */
  private runChildPipeline(previousResult: any, index: number, pipelineStep: any) {
    const childContext = pipelineStep.contextCreator({
      context: this.context,
      previousTaskResult: previousResult,
      allResults: this.results,
    });
    if (childContext === null || childContext === undefined) {
      this.skipStep(index, pipelineStep.stepName);
      return;
    }
    const child: TaskPipelineExecution<any, any, any, any> = new TaskPipelineExecution(
      pipelineStep.pipeline.pipelineType,
      childContext,
      pipelineStep.pipeline.tasksPipelineSteps,
      pipelineStep.pipeline.opts,
      {
        ...this.executionOpts,
        priority: this.forceRun ? FORCED_PRIORITY : this.executionOpts.priority,
        label: `${this.id}-${pipelineStep.pipeline.pipelineType}`,
      }
    );
    this.childExecutions[index] = child;
    this.emit("childPipelineStarted", { index, execution: child });
    child.once("completed", (childResult: any) => {
      /*
       * A pipeline result and a task result already have the same three
       * shapes, so this is a rename rather than a translation: the child's
       * reduced result becomes the step's value, and the parent's existing
       * handling of failure and cancellation applies unchanged.
       */
      const asTaskResult =
        childResult.status === "success"
          ? { status: "success", result: childResult.pipelineResult }
          : childResult.status === "cancelled"
          ? { status: "cancelled" }
          : { status: "failed", error: childResult.error };
      this.handleStepResult(index, asTaskResult, pipelineStep.stepName);
    });
    if (this.forceRun) {
      child.forceRunNow();
    }
    child.start();
  }

  private runNextTask(previousResult: any, index: number) {
    this.log("info", "Running next task", { index });
    const pipelineStep = this.pipelineSteps[index];
    if (!pipelineStep) {
      return;
    }
    if (isChildPipelineStep(pipelineStep)) {
      this.runChildPipeline(previousResult, index, pipelineStep);
      return;
    }
    const task: Task<any, any, any> = pipelineStep.taskCreator({
      context: this.context,
      previousTaskResult: previousResult,
      allResults: this.results,
    });
    if (!task) {
      this.skipStep(index, pipelineStep.stepName);
      return;
    }
    /*
     * Every step inherits the pipeline's priority and its forced flag.
     *
     * Priority so a backfill's transcription stays behind a download's for the
     * muxing and metadata steps too. Forced because the user asked for an item
     * to be finished, not for its first step to run - without this, a forced
     * pipeline stopped dead at the next step boundary while the queue was held,
     * which is what made people force-start every step by hand.
     */
    const managedTask = pipelineStep.taskManager.addTask(task, {
      priority: this.forceRun ? FORCED_PRIORITY : this.executionOpts.priority,
      forceStart: this.forceRun,
    });
    this.tasks[index] = managedTask;
    managedTask.task.once("started", () => {
      this.emit("stepTaskStarted", { index, task: managedTask as any });
    });
    managedTask.once("taskCompleted", ({ result }) => {
      this.log("info", `Got completed event for task ${index} ("${pipelineStep.stepName}")`);
      this.handleStepResult(index, result, pipelineStep.stepName);
    });
  }

  private makeStepId(index: number) {
    return `${this.id}-step-${index}`;
  }

  /**
   * Push this pipeline through a held queue, now and for its remaining steps.
   *
   * Returns what happened to the step currently waiting, so the caller can say
   * whether it started or is next in line - a forced task that cannot exceed
   * its manager's limit waits rather than being refused.
   */
  forceRunNow(): ForceStartOutcome {
    this.forceRun = true;
    // A child inherits the flag when it is created, but one already running
    // was created before this call and has to be told.
    const child = this.childExecutions[this.currentStepIndex];
    if (child && !child.isCompleted) {
      return child.forceRunNow();
    }
    const current = this.tasks[this.currentStepIndex];
    if (!current) {
      // Nothing queued yet - the flag alone is enough, and the step will be
      // forced as it is added.
      return "queued_at_front";
    }
    return current.forceStart();
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
        // Set only for a nested step, and only once its child exists. The
        // step itself runs nothing, so without this it would read as an empty
        // row rather than as work happening elsewhere.
        childPipelineId: this.childExecutions[index]?.id,
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

  /**
   * Stop this pipeline, whether or not it has started.
   *
   * The existing cancel path only ever worked on a running step: cancel() is
   * implemented per task type and does nothing to a task with nothing running,
   * so cancelling a queued pipeline returned success and left it in the queue
   * to start later as though nothing had happened.
   *
   * Running work is cancelled as before, and the step result marks the
   * pipeline cancelled the way it always has. Queued work is taken out of its
   * manager's queue - the only thing that actually stops it - and then this
   * completes the pipeline by hand, because no step result will ever arrive to
   * do it.
   */
  cancel(): boolean {
    if (this.isCompleted) {
      return false;
    }
    this.cancelRequested = true;
    /*
     * A nested step owns no task of its own, so the task path below would find
     * nothing and complete this pipeline while the child carried on running.
     * Cancelling the child is enough: its completion arrives as a cancelled
     * step result, and the parent's existing handling takes it from there -
     * including continueOnCancel, if that is what the step asked for.
     */
    const child = this.childExecutions[this.currentStepIndex];
    if (child && !child.isCompleted) {
      return child.cancel();
    }
    const managedTask = this.getCurrentStep()?.managedTask as
      | { task?: { id: string; getTaskState(): string; cancel(): unknown }; taskManager?: { dequeueTask(taskId: string): boolean } }
      | undefined;
    const task = managedTask?.task;
    if (task && task.getTaskState() === "running") {
      task.cancel();
      return true;
    }
    if (task) {
      managedTask?.taskManager?.dequeueTask(task.id);
    }
    this.emit("completed", { status: "cancelled", results: this.results } as any);
    return true;
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
    const resumeFrom = this.executionOpts.resumeFrom;
    if (resumeFrom && resumeFrom.stepIndex > 0) {
      // Seed the completed steps' results before continuing: later steps read
      // earlier ones (Inject Metadata consumes the subtitles and chapters
      // results), so resuming without them would just re-run the steps that
      // produced them - which is the expense this exists to avoid.
      resumeFrom.results.forEach((result, index) => {
        if (index < resumeFrom.stepIndex) {
          (this.results as any)[index] = result;
        }
      });
      this.currentStepIndex = resumeFrom.stepIndex;
      const previous: any = (this.results as any)[resumeFrom.stepIndex - 1];
      this.log("info", `Resuming pipeline at step ${resumeFrom.stepIndex} of ${this.pipelineSteps.length}`);
      this.runNextTask(previous?.status === "success" ? previous.result : undefined, resumeFrom.stepIndex);
      return;
    }
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
