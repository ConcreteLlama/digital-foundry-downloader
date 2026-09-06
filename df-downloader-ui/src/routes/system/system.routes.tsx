import ComputerIcon from '@mui/icons-material/Computer';
import InfoIcon from '@mui/icons-material/InfoOutlined';
import ChangelogIcon from '@mui/icons-material/History';
import LogsIcon from '@mui/icons-material/Subject';
import StreamsIcon from '@mui/icons-material/SlowMotionVideo';
import { ChangelogDisplay } from '../../components/general/changelog.component.tsx';
import { LogsPage } from '../../components/log-view/logs-view.component.tsx';
import { ActiveStreamsView } from '../../components/system/active-streams.component.tsx';
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
    {
      // Under System rather than Activity: these are processes, not tasks -
      // they have no queue position, no pipeline and no history, and putting
      // them beside real tasks would imply all three.
      path: "/system/streams",
      element: <ActiveStreamsView />,
      name: "Streams",
      icon: StreamsIcon,
    },
  ],
};
