import HandymanIcon from "@mui/icons-material/Handyman";
import DriveFileMove from "@mui/icons-material/DriveFileMove";
import { NestedSubRoute } from "../nav/nested-routes.tsx";
import { ReorgnaizeFilesPage } from "../../components/tools/batch-move-files/reorganize-files-page.component.tsx";
import { MaintenanceToolsPage } from "../../components/tools/maintenance/maintenance-tools-page.tsx";

export const toolsRouteDefinitions: NestedSubRoute = {
  name: "Tools",
  icon: HandymanIcon,
  routes: [
    {
      path: "/tools/reorganize-files",
      element: <ReorgnaizeFilesPage />,
      name: "Reorgnaize Files",
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
