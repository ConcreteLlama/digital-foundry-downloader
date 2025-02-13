import { Button, styled } from "@mui/material";
import { TaskInfo } from "df-downloader-common";
import { useSelector } from "react-redux";
import { clearTask } from "../../../api/tasks.ts";
import { API_URL } from "../../../config.ts";
import { selectTasksByIs } from "../../../store/df-tasks/tasks.selector.ts";
import { postJson } from "../../../utils/fetch.ts";

export const MaintenanceToolButtonStyle = styled(Button)(({  }) => ({
    height: '100%',
    width: '100%',
}));

type MaintenanceToolButtonProps = {
    task?: TaskInfo
    onClick: () => void
    idleText?: string
    startText?: string
    clearText?: string
    runningText?: string
}
export const MaintenanceToolButton = (props: MaintenanceToolButtonProps) => {
    const { task, onClick, idleText = "Queued", startText = "Start", clearText = "Clear", runningText = "Running"} = props;
    const clearTaskInfo = () => task && clearTask(task.id);
    const isIdle = task?.status?.state === "idle" || false;
    const isComplete = task?.status?.isComplete || false;
    const buttonLabel = task ? (isIdle ? idleText : isComplete ? clearText : runningText) : startText;
    const buttonAction = isComplete ? clearTaskInfo : onClick;
    return (
        <MaintenanceToolButtonStyle variant={isComplete ? 'outlined' : 'contained'} onClick={buttonAction} sx={{flexShrink: 0}} disabled={Boolean(task) && !isComplete}>{buttonLabel}</MaintenanceToolButtonStyle>
    )
}

type BasicMaintenanceToolButtonProps = {
    startTaskFn: () => void
    taskIsFn: (task: any) => task is any;
}
export const BasicMaintenanceToolButton = (props: BasicMaintenanceToolButtonProps) => {
    const { taskIsFn, startTaskFn } = props;
    const task = useSelector(selectTasksByIs(taskIsFn))[0];
    return (
        <MaintenanceToolButton onClick={startTaskFn} task={task} />
    )
}

export type SimpleTaskMaintenanceToolButtonProps = {
    taskIsFn: (task: any) => task is any;
    startEndpoint: string;
}
export const SimpleTaskMaintenanceToolButton = (props: SimpleTaskMaintenanceToolButtonProps) => {
    return <BasicMaintenanceToolButton startTaskFn={() => postJson(`${API_URL}/${props.startEndpoint}`, {})} taskIsFn={props.taskIsFn} />
}