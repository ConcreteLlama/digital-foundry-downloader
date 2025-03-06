import { getTaskFriendlyName, getTaskPipelineFriendlyName, TaskPipelineInfo } from "df-downloader-common";
import { closeSnackbar, VariantType } from "notistack";
import { clearTask } from "../../api/tasks.ts";
import { TaskEvent, taskEvents } from "../../store/df-tasks/task-events.ts";
import { triggerSnackbar } from "../../utils/snackbar.tsx";

const makeContentTitle = (task: TaskPipelineInfo): string => `${task.pipelineDetails.dfContent.title} (${task.pipelineDetails.mediaFormat})`;

const registerTaskSnackbarTriggers = () => {
    const handleTaskAdded = ({task, firstFetch}: TaskEvent) => {
        if (firstFetch) {
            return;
        }
        let snackbarMessage: string = 'Task added';
        if (task.type === 'pipeline') {
            const contentTitle = makeContentTitle(task);
            if (task.pipelineType === 'download') {
                snackbarMessage = `Added ${contentTitle} to download queue`;
            } else if (task.pipelineType === 'subtitles') {
                snackbarMessage = `Queued fetch subtitles for ${contentTitle}`;
            } else {
                snackbarMessage = `Queued ${getTaskPipelineFriendlyName(task)} task`;
            }
        } else {
            snackbarMessage = `Queued ${getTaskFriendlyName(task)} task`;
        }
        triggerSnackbar(snackbarMessage, {
            variant: 'info',
        });
    };

    const handleTaskCompleted = ({task, firstFetch}: TaskEvent) => {
        if (firstFetch) {
            return;
        }
        let snackbarMessage: string = 'Task completed';
        let snackbarSeverity: VariantType = 'success';
        console.log('Task completed:', task);
        if (task.type === 'pipeline') {
            const pipelineResult = task.pipelineStatus.pipelineResult;
            const contentTitle = makeContentTitle(task);
            if (task.pipelineType === 'download') {
                switch (pipelineResult) {
                    case 'success':
                        snackbarMessage = `Download ${contentTitle} completed`;
                        break;
                    case 'cancelled':
                        snackbarMessage = `Download ${contentTitle} cancelled`;
                        break;
                    case 'failed':
                        snackbarMessage = `Download ${contentTitle} failed`;
                        break;
                }
            } else if (task.pipelineType === 'subtitles') {
                switch (pipelineResult) {
                    case 'success':
                        snackbarMessage = `Subtitles for ${contentTitle} downloaded`;
                        break;
                    case 'cancelled':
                        snackbarMessage = `Subtitles for ${contentTitle} cancelled`;
                        break;
                    case 'failed':
                        snackbarMessage = `Subtitles for ${contentTitle} failed`;
                        break;
                }
            } else {
                snackbarMessage = `${getTaskPipelineFriendlyName(task)} task completed`;
            }
            snackbarSeverity = pipelineResult === 'cancelled' ? 'warning' : pipelineResult === 'failed' ? 'error' : 'success';
        } else {
            const endMessage = task.status?.error ? 'failed' : 'completed';
            snackbarMessage = `${getTaskFriendlyName(task)} task ${endMessage}`;
            snackbarSeverity = task.status?.error ? 'error' : 'success';
        }
        triggerSnackbar(snackbarMessage, {
            variant: snackbarSeverity,
            actionButton: {
                text: 'Clear Task',
                onClick: (key) => {
                    clearTask(task.id).then(() => {
                        closeSnackbar(key);
                    }).catch(() => {
                        triggerSnackbar('Failed to clear task', {
                            variant: 'error',
                        });
                    });
                },
            },
        });
    };

    taskEvents.on('taskAdded', handleTaskAdded);
    taskEvents.on('taskCompleted', handleTaskCompleted);

    return () => {
        taskEvents.off('taskAdded', handleTaskAdded);
        taskEvents.off('taskCompleted', handleTaskCompleted);
    };
};

export default registerTaskSnackbarTriggers;