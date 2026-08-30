import ComputerIcon from '@mui/icons-material/Computer';
import ChangelogIcon from '@mui/icons-material/History';
import LogsIcon from '@mui/icons-material/Subject';
import { ChangelogDisplay } from '../../components/general/changelog.component.tsx';
import { LogsView } from '../../components/log-view/logs-view.component.tsx';
import { NestedSubRoute } from "../nav/nested-routes.tsx";

export const systemRouteDefinitions: NestedSubRoute = {
  name: "System",
  icon: ComputerIcon,
  routes: [
    {
      path: "/system/changelog",
      element: <ChangelogDisplay/>,
      name: "Changelog",
      icon: ChangelogIcon,
    },
    {
      path: "/system/logs",
      element: <LogsView />,
      name: "Logs",
      icon: LogsIcon,
    },
  ],
};
