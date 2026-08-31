import { getTaskFriendlyName, getTaskPipelineFriendlyName, TaskPipelineInfo } from "df-downloader-common";
import { closeSnackbar, VariantType, SnackbarKey } from "notistack";
import { clearPipeline, clearTask } from "../../api/tasks.ts";
import { TaskEvent, taskEvents } from "../../store/df-tasks/task-events.ts";
import { triggerGroupedSnackbar, triggerSnackbar } from "../../utils/snackbar.tsx";

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
                snackbarMessage = `Queued subtitle generation for ${contentTitle}`;
            } else {
                snackbarMessage = `Queued ${getTaskPipelineFriendlyName(task)} task`;
            }
        } else {
            snackbarMessage = `Queued ${getTaskFriendlyName(task)} task`;
        }
        // Queueing is the burst case - a backfill fires one of these per item -
        // and the title of the two hundredth is not what anyone needs.
        triggerGroupedSnackbar({
            groupKey: `added:${task.type === 'pipeline' ? task.pipelineType : 'task'}`,
            message: snackbarMessage,
            summary: (count) => `${count} more queued`,
            variant: 'info',
        });
    };

    const handleTaskCompleted = ({task, firstFetch}: TaskEvent) => {
        if (firstFetch) {
            return;
        }
        let snackbarMessage: string = 'Task completed';
        let snackbarSeverity: VariantType = 'success';
        const clearTaskFn = task.type === 'pipeline' ? clearPipeline : clearTask;
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
                        snackbarMessage = `Subtitles generated for ${contentTitle}`;
                        break;
                    case 'cancelled':
                        snackbarMessage = `Subtitle generation for ${contentTitle} cancelled`;
                        break;
                    case 'failed':
                        snackbarMessage = `Subtitle generation for ${contentTitle} failed`;
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
        const clearAction = {
            text: 'Clear Task',
            onClick: (key: SnackbarKey) => {
                clearTaskFn(task.id).then(() => {
                    closeSnackbar(key);
                }).catch(() => {
                    triggerSnackbar('Failed to clear task', {
                        variant: 'error',
                    });
                });
            },
        };
        // Only the routine ones are grouped. A failure or a cancellation is
        // the toast worth reading, and folding it into "12 more completed"
        // would lose the one message that mattered.
        if (snackbarSeverity !== 'success') {
            triggerSnackbar(snackbarMessage, { variant: snackbarSeverity, actionButton: clearAction });
            return;
        }
        triggerGroupedSnackbar({
            groupKey: `completed:${task.type === 'pipeline' ? task.pipelineType : 'task'}`,
            message: snackbarMessage,
            summary: (count) => `${count} more completed`,
            variant: 'success',
            firstOpts: { actionButton: clearAction },
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