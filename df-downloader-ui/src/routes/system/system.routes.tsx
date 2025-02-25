import ComputerIcon from '@mui/icons-material/Computer';
import ChangelogIcon from '@mui/icons-material/History';
import { ChangelogDisplay } from '../../components/general/changelog.component.tsx';
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
  ],
};
