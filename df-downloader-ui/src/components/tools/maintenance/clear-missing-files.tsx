import { Box, Typography } from "@mui/material"
import { ClearMissingFilesTaskInfo, isClearMissingFilesTaskInfo } from "df-downloader-common"
import { useSelector } from "react-redux"
import { selectClearMissingFilesTasks } from "../../../store/df-tasks/tasks.selector.ts"
import { LinearProgressWithLabel } from "../../general/linear-progress-with-label.component.tsx"
import { SimpleTaskMaintenanceToolButton } from "./maintenance-tool-button.tsx"

export const ClearMissingFilesButton = () => <SimpleTaskMaintenanceToolButton startEndpoint="content/clear-missing-files" taskIsFn={isClearMissingFilesTaskInfo} />

export const ClearMissingFilesInfoView = () => {
    const clearMissingFilesTasks = useSelector(selectClearMissingFilesTasks);
    const clearMissingFilesTask = clearMissingFilesTasks[0];
    return clearMissingFilesTask ?
                <ClearMissingFilesTaskInfoView task={clearMissingFilesTask} /> :
                <Typography>Clear Missing Files will remove any references to files that no longer exist on disk</Typography>
}

type ClearMissingFilesTaskViewProps = {
    task: ClearMissingFilesTaskInfo
}
const ClearMissingFilesTaskInfoView = ({ task }: ClearMissingFilesTaskViewProps) => {
    const { totalScanned = 0, totalToScan = 0, removedFileReferenceCount = 0 } = task.status || {};
    const percentComplete = totalToScan === 0 ? 0 : (totalScanned / totalToScan) * 100;
    const isComplete = task.status?.isComplete || false;
    const isIdle = task.status?.state === "idle" || false;
    const removedText = `Scanned ${totalScanned}/${totalToScan}, Removed ${removedFileReferenceCount}`;
    const label = isIdle ? 'Task is queued' : isComplete ? `Complete: ${removedText}` : `${removedText}`;
    return (
        <Box sx={{
            display: "flex",
            flexDirection: "row",
            gap: "1rem",
            alignItems: "center",
            width: "100%"
        }}>
            {!isComplete && <LinearProgressWithLabel variant="determinate" value={percentComplete} sx={{width: "100%"}} labelPosition="bottom" label={label}/>}
            {isComplete && <Typography>{label}</Typography>}
        </Box>
    )
}
