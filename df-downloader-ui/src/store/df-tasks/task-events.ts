import { TaskInfo, TaskPipelineInfo } from 'df-downloader-common';
import { EventEmitter } from 'events';

export type TaskEvent = {
    task: TaskPipelineInfo | TaskInfo;
    firstFetch: boolean;
}
export type TaskEventMap = {
    taskAdded: [TaskEvent];
    taskUpdated: [TaskEvent];
    taskRemoved: [TaskEvent];
    taskCompleted: [TaskEvent];
}

export const taskEvents = new EventEmitter<TaskEventMap>();