import ComputerIcon from "@mui/icons-material/Computer";
import { NestedSubRouteNavItem } from "../nav/nested-routes.tsx";
import { systemRouteDefinitions } from "./system.routes.tsx";

type SystemNavProps = {
  onItemSelected?: () => void;
};
export const SystemNav = ({ onItemSelected }: SystemNavProps) => {
  return <NestedSubRouteNavItem subRoute={systemRouteDefinitions} level={0} onItemSelected={onItemSelected} keyBase={"system"} icon={ComputerIcon} />;
};