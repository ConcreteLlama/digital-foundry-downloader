import { ExpandLess, ExpandMore } from "@mui/icons-material";
import { Box, Collapse, List, ListItemButton, ListItemIcon, ListItemText, SvgIconProps } from "@mui/material";
import React from "react";
import { useSelector } from "react-redux";
import { selectDevConfigEnabled } from "../../store/config/config.selector.ts";
import { NavItem } from "./nav-item.component";

export type NestedRoute = {
  path: string;
  element: JSX.Element;
  name: string;
  icon?: React.FC;
  devOnly?: boolean;
};
export const isNestedRoute = (route: NestedRouteElement): route is NestedRoute => {
  return (route as NestedRoute).path !== undefined;
};

export type NestedSubRoute = {
  name: string;
  icon?: React.FC;
  routes: NestedRouteElement[];
  devOnly?: boolean;
};
export const isNestedSubRoute = (route: NestedRouteElement): route is NestedSubRoute => {
  return (route as NestedSubRoute).routes !== undefined;
};

export type NestedRouteElement = NestedRoute | NestedSubRoute;

export type NestedNavProps = {
    onItemSelected?: () => void;
  };
export type NestedRouteNavItemProps = {
    keyBase: string;
    route: NestedRoute;
    level: number;
    onItemSelected?: () => void;
  };
export const NestedRouteNavItem = ({ route, level, onItemSelected, keyBase }: NestedRouteNavItemProps) => {
    const pl = 2 * (level + 2);
    return (
      <NavItem
        key={`${keyBase}-nav-${route.name}`}
        to={route.path}
        text={route.name}
        icon={route.icon}
        sx={{ pl }}
        onItemSelected={onItemSelected}
      />
    );
  };

 export type NestedSubRouteNavItemProps = {
    keyBase: string;
    subRoute: NestedSubRoute;
    icon: React.FC<SvgIconProps>;
    level: number;
    onItemSelected?: () => void;
  };
 export const NestedSubRouteNavItem = ({ subRoute, level, onItemSelected, keyBase, icon: RouteIcon }: NestedSubRouteNavItemProps) => {
    const devModeEnabled = useSelector(selectDevConfigEnabled);
    const [open, setOpen] = React.useState(false);
    const handleClick = () => {
      setOpen(!open);
    };
    return (
      <Box sx={{ pl: level * 2 }}>
        <ListItemButton onClick={handleClick}>
          <ListItemIcon>
            <RouteIcon color="primary" />
          </ListItemIcon>
          <ListItemText primary={subRoute.name} />
          {open ? <ExpandLess /> : <ExpandMore />}
        </ListItemButton>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {subRoute.routes.map((route) => {
              if (route.devOnly && !devModeEnabled) return null;
              return isNestedRoute(route) ? (
                <NestedRouteNavItem
                  route={route}
                  level={level}
                  onItemSelected={onItemSelected}
                  key={`${keyBase}-nested-route:${route}:${level}`}
                  keyBase={keyBase}
                />
              ) : (
                <NestedSubRouteNavItem subRoute={route} level={level + 1} keyBase={keyBase} icon={RouteIcon} />
              );
            })}
          </List>
        </Collapse>
      </Box>
    );
  };