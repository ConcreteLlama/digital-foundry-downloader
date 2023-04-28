import React from "react";
import { Box, Collapse, List, ListItemButton, ListItemIcon, ListItemText } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { NavItem } from "../nav/nav-item.component";
import { SettingsRoute, SettingsSubRoute, isSettingsRoute, settingsRoutes } from "./settings.routes";

export const SettingsNav = () => {
  return <SettingsSubRouteNavItem subRoute={settingsRoutes} level={0} />;
};
type SettingsRouteNavItemProps = {
  route: SettingsRoute;
  level: number;
};
const SettingsRouteNavItem = ({ route, level }: SettingsRouteNavItemProps) => {
  const pl = 2 * (level + 2);
  return <NavItem key={`settings-nav-${route.name}`} to={route.path} text={route.name} icon={route.icon} sx={{ pl }} />;
};

type SettingsSubRouteNavItemProps = {
  subRoute: SettingsSubRoute;
  level: number;
};
const SettingsSubRouteNavItem = ({ subRoute, level }: SettingsSubRouteNavItemProps) => {
  const [open, setOpen] = React.useState(false);
  const handleClick = () => {
    setOpen(!open);
  };
  return (
    <Box sx={{ pl: level * 2 }}>
      <ListItemButton onClick={handleClick}>
        <ListItemIcon>
          <SettingsIcon color="primary" />
        </ListItemIcon>
        <ListItemText primary={subRoute.name} />
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List component="div" disablePadding>
          {subRoute.routes.map((route) =>
            isSettingsRoute(route) ? (
              <SettingsRouteNavItem route={route} level={level} />
            ) : (
              <SettingsSubRouteNavItem subRoute={route} level={level + 1} />
            )
          )}
        </List>
      </Collapse>
    </Box>
  );
};
