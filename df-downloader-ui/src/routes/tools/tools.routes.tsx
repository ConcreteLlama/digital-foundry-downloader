import HandymanIcon from "@mui/icons-material/Handyman";
import DriveFileMove from "@mui/icons-material/DriveFileMove";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import { NestedSubRoute } from "../nav/nested-routes.tsx";
import { BulkBackfillPage } from "../../components/tools/bulk-backfill/bulk-backfill-page.component.tsx";
import { ReorganizeFilesPage } from "../../components/tools/batch-move-files/reorganize-files-page.component.tsx";
import { MaintenanceToolsPage } from "../../components/tools/maintenance/maintenance-tools-page.tsx";

export const toolsRouteDefinitions: NestedSubRoute = {
  name: "Tools",
  icon: HandymanIcon,
  // Three pages do not justify a second vertical nav beside the rail, and
  // these are wide - the backfill list and the file-move preview are both
  // tables that want the width more than a column of three links does.
  // Settings keeps its column; a dozen pages genuinely need one.
  compactNavOnly: true,
  routes: [
    {
      path: "/tools/backfill",
      element: <BulkBackfillPage />,
      name: "Backfill",
      icon: PlaylistAddCheckIcon,
    },
    {
      path: "/tools/reorganize-files",
      element: <ReorganizeFilesPage />,
      name: "Reorganize Files",
      icon: DriveFileMove,
    },
    {
      path: "/tools/maintenance",
      element: <MaintenanceToolsPage/>,
      name: "Maintenance",
      icon: HandymanIcon,
    }
  ],
};
