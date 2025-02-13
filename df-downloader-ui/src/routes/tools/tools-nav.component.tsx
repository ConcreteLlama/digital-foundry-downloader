import HandymanIcon from "@mui/icons-material/Handyman";
import { NestedSubRouteNavItem } from "../nav/nested-routes.tsx";
import { toolsRouteDefinitions } from "./tools.routes.tsx";

type ToolsNavProps = {
  onItemSelected?: () => void;
};
export const ToolsNav = ({ onItemSelected }: ToolsNavProps) => {
  return <NestedSubRouteNavItem subRoute={toolsRouteDefinitions} level={0} onItemSelected={onItemSelected} keyBase={"tools"} icon={HandymanIcon} />;
};