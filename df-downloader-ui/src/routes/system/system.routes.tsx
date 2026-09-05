import ComputerIcon from '@mui/icons-material/Computer';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import ChangelogIcon from '@mui/icons-material/History';
import LogsIcon from '@mui/icons-material/Subject';
import { ChangelogDisplay } from '../../components/general/changelog.component.tsx';
import { LogsPage } from '../../components/log-view/logs-view.component.tsx';
import { SystemInfoView } from '../../components/system/system-info.component.tsx';
import { NestedSubRoute } from "../nav/nested-routes.tsx";

export const systemRouteDefinitions: NestedSubRoute = {
  name: "System",
  icon: ComputerIcon,
  routes: [
    {
      path: "/system/about",
      element: <SystemInfoView />,
      name: "About",
      icon: InfoIcon,
    },
    {
      path: "/system/changelog",
      element: <ChangelogDisplay/>,
      name: "Changelog",
      icon: ChangelogIcon,
    },
    {
      path: "/system/logs",
      element: <LogsPage />,
      name: "Logs",
      icon: LogsIcon,
    },
  ],
};
