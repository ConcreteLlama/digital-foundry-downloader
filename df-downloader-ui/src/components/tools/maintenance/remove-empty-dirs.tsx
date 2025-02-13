import { Box, Typography } from "@mui/material"
import { isRemoveEmptyDirsTaskInfo, RemoveEmptyDirsTaskInfo } from "df-downloader-common"
import { useSelector } from "react-redux"
import { selectTasksByIs } from "../../../store/df-tasks/tasks.selector.ts"
import { AnimatedEllipsis } from "../../../styles/animated-ellipsis.tsx"
import { SimpleTaskMaintenanceToolButton } from "./maintenance-tool-button.tsx"

export const RemoveEmptyDirsButton = () => <SimpleTaskMaintenanceToolButton startEndpoint="content/remove-empty-dirs" taskIsFn={isRemoveEmptyDirsTaskInfo} />

export const RemoveEmptyDirsToolView = () => {
    const RemoveEmptyDirsTasks = useSelector(selectTasksByIs(isRemoveEmptyDirsTaskInfo));
    const RemoveEmptyDirsTask = RemoveEmptyDirsTasks[0];
    return RemoveEmptyDirsTask ?
                <RemoveEmptyDirsTaskInfoView task={RemoveEmptyDirsTask} /> :
                <Typography>Scan your configured storage for existing content</Typography>
}

type RemoveEmptyDirsTaskInfoViewProps = {
    task: RemoveEmptyDirsTaskInfo
}
const RemoveEmptyDirsTaskInfoView = ({ task }: RemoveEmptyDirsTaskInfoViewProps) => {
    const { result } = task;
    const removedDirs = result?.removedDirs || [];
    const isComplete = task.status?.isComplete || false;
    const isIdle = task.status?.state === "idle" || false;
    const label = isIdle ? 'Task is queued' : `Scanning and removing empty directories`;
    return (
        <Box sx={{
            display: "flex",
            flexDirection: "row",
            gap: "1rem",
            alignItems: "center",
            width: "100%"
        }}>
            {isComplete ?
                <Typography>{`Removed ${removedDirs.length} empty directories`}</Typography>
                :
                <Typography>{label}<AnimatedEllipsis/></Typography>
            }            
        </Box>
    )
}
