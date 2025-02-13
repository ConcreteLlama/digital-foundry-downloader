import SettingsIcon from "@mui/icons-material/Settings";
import { NestedSubRouteNavItem } from "../nav/nested-routes.tsx";
import { settingsRouteDefinitions } from "./settings.routes";

type SettingsNavProps = {
  onItemSelected?: () => void;
};
export const SettingsNav = ({ onItemSelected }: SettingsNavProps) => {
  return <NestedSubRouteNavItem subRoute={settingsRouteDefinitions} level={0} onItemSelected={onItemSelected} keyBase={"settings"} icon={SettingsIcon} />;
};