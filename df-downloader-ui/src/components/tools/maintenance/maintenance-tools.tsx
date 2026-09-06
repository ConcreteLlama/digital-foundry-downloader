import { ClearEmptyAnalysesButton, ClearEmptyAnalysesView } from "./clear-empty-analyses.tsx";
import { ClearMissingFilesButton, ClearMissingFilesInfoView } from "./clear-missing-files.tsx"
import { RemoveEmptyDirsButton, RemoveEmptyDirsToolView } from "./remove-empty-dirs.tsx";
import { ScanForExistingContentButton, ScanForExsitingContentToolView } from "./scan-for-existing-content.tsx";

type MaintenanceTool = {
    button: JSX.Element;
    view: JSX.Element;
}

export const MaintenanceTools: Record<string, MaintenanceTool> = {
    "Clear Missing Files": {
        button: <ClearMissingFilesButton />,
        view: <ClearMissingFilesInfoView />,
    },
    "Scan For Existing Content": {
        button: <ScanForExistingContentButton />,
        view: <ScanForExsitingContentToolView />,
    },
    "Clear Empty Analyses": {
        button: <ClearEmptyAnalysesButton />,
        view: <ClearEmptyAnalysesView />,
    },
    "Remove Empty Directories": {
        button: <RemoveEmptyDirsButton />,
        view: <RemoveEmptyDirsToolView />,
    },
}
