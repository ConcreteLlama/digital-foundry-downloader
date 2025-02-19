import { WorkerQueue } from "../../utils/queue-utils.js";
import { TaskControllerTaskBuilder, TaskControls } from "./task-controller-task.js";
import { TaskOpts } from "./task.js";

type BatchOperationResult<OPERATION_PARAMETERS, RESULT_TYPE> = {
    results: BatchOperationRuntimeInfo<OPERATION_PARAMETERS, RESULT_TYPE>[];
    errors?: any[];
}

type BatchOperationStatus<OPERATION_PARAMETERS, RESULT_TYPE> = {
    moveStatuses: BatchOperationRuntimeInfo<OPERATION_PARAMETERS, RESULT_TYPE>[];
}

type BatchOperationRuntimeInfo<OPERATION_PARAMETERS, RESULT_TYPE> = {
    params: OPERATION_PARAMETERS;
    startTime?: Date;
    endTime?: Date;
    error?: any;
    result?: RESULT_TYPE;
}

type BatchOperationContext<OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE> = {
    opts: BatchOperationOpts;
    taskOpts: TASK_OPTS;
    operations: BatchOperationRuntimeInfo<OPERATION_PARAMETERS, RESULT_TYPE>[];
    workerQueue: WorkerQueue;
}

const makeInitialContext = <OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE>(operationParameters: OPERATION_PARAMETERS[], taskOpts: TASK_OPTS, opts: BatchOperationOpts): BatchOperationContext<OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE> => ({
    opts,
    taskOpts,
    operations: operationParameters.map(opParams => ({ params: opParams })),
    workerQueue: new WorkerQueue({
        namePrefix: `batch-op-queue-${Math.random()}`,
        concurrent: opts.maxConcurrent,
    }),
})

type BatchOperationOpts = {
    maxConcurrent: number;
}

const makeControls = <OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE>(fn: (params: OPERATION_PARAMETERS, opts: TASK_OPTS) => RESULT_TYPE | Promise<RESULT_TYPE>): TaskControls<BatchOperationResult<OPERATION_PARAMETERS, RESULT_TYPE>, BatchOperationContext<OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE>, BatchOperationStatus<OPERATION_PARAMETERS, RESULT_TYPE>> => ({
    start: async ({ workerQueue, taskOpts, operations }: BatchOperationContext<OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE>) => {
        const results = await Promise.allSettled(operations.map(async (op) =>
            workerQueue.addWork(async () => {
                op.startTime = new Date();
                try {
                    const result = await fn(op.params, taskOpts);
                    op.result = result;
                } catch (e) {
                    console.log("Error in operation", e);
                    op.error = e;
                } finally {
                    op.endTime = new Date();
                }
            })
        ));
        const errors = results.reduce((acc: any[], result, index) => {
            if (result.status === "rejected") {
                acc.push(result.reason);
            } else if (operations[index].error) {
                acc.push(operations[index].error);
            }
            return acc;
        }, []);
        return {
            results: operations,
            errors: errors.length > 0 ? errors : undefined,
        }
    },
    pause: async ({ workerQueue }) => {
        workerQueue.pause();
    },
    resume: async ({ workerQueue }) => {
        workerQueue.resume();
    },
    cancel: async ({ workerQueue }) => {
        await workerQueue.cancel();
    },
    getStatus: ({ operations }) => {
        return {
            moveStatuses: operations,
        }
    }
});
export const BatchOperationTaskBuilder = <OPERATION_PARAMETERS, TASK_OPTS, RESULT_TYPE>(fn: (params: OPERATION_PARAMETERS, taskOpts: TASK_OPTS) => Promise<RESULT_TYPE>, defaultOpts: Partial<TaskOpts> = {}) => {
    const builder = TaskControllerTaskBuilder(makeControls(fn), defaultOpts);
    return (operationParameters: OPERATION_PARAMETERS[], taskOpts: TASK_OPTS, opts: BatchOperationOpts) => builder(makeInitialContext(operationParameters, taskOpts, opts));
}