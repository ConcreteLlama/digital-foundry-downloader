import { Box, Typography } from "@mui/material"
import { isScanForExistingContentTaskInfo, ScanForExistingContentTaskInfo } from "df-downloader-common"
import { useSelector } from "react-redux"
import { selectTasksByIs } from "../../../store/df-tasks/tasks.selector.ts"
import { AnimatedEllipsis } from "../../../styles/animated-ellipsis.tsx"
import { SimpleTaskMaintenanceToolButton } from "./maintenance-tool-button.tsx"

export const ScanForExistingContentButton = () => <SimpleTaskMaintenanceToolButton startEndpoint="content/scan-for-existing-content" taskIsFn={isScanForExistingContentTaskInfo} />

export const ScanForExsitingContentToolView = () => {
    const scanForExistingContentTasks = useSelector(selectTasksByIs(isScanForExistingContentTaskInfo));
    const scanForExistingContentTask = scanForExistingContentTasks[0];
    return scanForExistingContentTask ?
                <ScanForExsitingContentTaskInfoView task={scanForExistingContentTask} /> :
                <Typography>Scan your configured storage for existing content</Typography>
}

type ScanForExsitingContentTaskInfoViewProps = {
    task: ScanForExistingContentTaskInfo
}
const ScanForExsitingContentTaskInfoView = ({ task }: ScanForExsitingContentTaskInfoViewProps) => {
    const { result } = task;
    const foundFiles = result?.foundFiles || [];
    const isComplete = task.status?.isComplete || false;
    const isIdle = task.status?.state === "idle" || false;
    const label = isIdle ? 'Task is queued' : `Scanning for existing content`;
    return (
        <Box sx={{
            display: "flex",
            flexDirection: "row",
            gap: "1rem",
            alignItems: "center",
            width: "100%"
        }}>
            {isComplete ?
                <Typography>{`Found ${foundFiles.length} files`}</Typography>                                    :
                <Typography>{label}<AnimatedEllipsis/></Typography>
            }            
        </Box>
    )
}
