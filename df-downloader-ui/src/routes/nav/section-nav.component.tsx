import { Box, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from "@mui/material";
import { useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { selectDevConfigEnabled } from "../../store/config/config.selector";
import { useDirtySections } from "../../components/settings/dirty-sections";
import { findDestination, flattenSectionRoutes } from "./nav-destinations";

/**
 * A section's own pages, rendered as a column inside the page rather than as a
 * nested accordion in the nav rail. Same route data as before - this is a new
 * renderer over `NestedSubRoute.routes`, not a new route shape.
 */
/**
 * /settings/subtitles -> the "subtitles" config section. Only settings routes
 * map to a section; tools and system pages have nothing to be dirty.
 */
const sectionKeyFor = (path: string) => path.split("/")[2];

export const SectionNav = () => {
  const { pathname } = useLocation();
  const dirtySections = useDirtySections();
  const devModeEnabled = useSelector(selectDevConfigEnabled);
  const destination = findDestination(pathname);
  if (!destination?.section) {
    return null;
  }
  const routes = flattenSectionRoutes(destination.section).filter((r) => !r.devOnly || devModeEnabled);
  if (routes.length <= 1) {
    // A single-page section doesn't need a column to choose from.
    return null;
  }
  return (
    <Box
      component="nav"
      sx={{
        width: 208,
        flexShrink: 0,
        borderRight: "1px solid",
        borderColor: "divider",
        paddingRight: 2,
        marginRight: 4,
        display: { xs: "none", md: "block" },
      }}
    >
      <Typography variant="overline" sx={{ paddingLeft: 2 }}>
        {destination.label}
      </Typography>
      <List dense disablePadding>
        {routes.map((route) => {
          const selected = pathname === route.path;
          const RouteIcon = route.icon;
          return (
            <ListItemButton
              key={route.path}
              component={Link}
              to={route.path}
              selected={selected}
              sx={{ borderRadius: 1, marginBottom: 0.25 }}
            >
              {RouteIcon && (
                <ListItemIcon sx={{ minWidth: 34, color: selected ? "primary.main" : "text.secondary" }}>
                  <RouteIcon />
                </ListItemIcon>
              )}
              <ListItemText
                primary={route.name}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: selected ? 600 : 400,
                  color: selected ? "text.primary" : "text.secondary",
                }}
              />
              {/* A section holding unsaved edits keeps a dot, so navigating
                  away and forgetting is visible rather than silent. */}
              {dirtySections.includes(sectionKeyFor(route.path) as never) && (
                <Tooltip title="Unsaved changes">
                  <Box
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: "warning.main",
                      flexShrink: 0,
                    }}
                  />
                </Tooltip>
              )}
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
};

/**
 * Below md the column would eat the page, so the section's pages become a
 * horizontal scroller above the content instead.
 */
export const SectionNavCompact = () => {
  const { pathname } = useLocation();
  const devModeEnabled = useSelector(selectDevConfigEnabled);
  const destination = findDestination(pathname);
  if (!destination?.section) {
    return null;
  }
  const routes = flattenSectionRoutes(destination.section).filter((r) => !r.devOnly || devModeEnabled);
  if (routes.length <= 1) {
    return null;
  }
  return (
    <Box
      sx={{
        display: { xs: "flex", md: "none" },
        gap: 1,
        overflowX: "auto",
        paddingBottom: 1,
        marginBottom: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      {routes.map((route) => {
        const selected = pathname === route.path;
        return (
          <ListItemButton
            key={route.path}
            component={Link}
            to={route.path}
            selected={selected}
            sx={{ borderRadius: 1, flex: "0 0 auto", paddingY: 0.5 }}
          >
            <ListItemText
              primary={route.name}
              primaryTypographyProps={{
                variant: "body2",
                noWrap: true,
                fontWeight: selected ? 600 : 400,
                color: selected ? "text.primary" : "text.secondary",
              }}
            />
          </ListItemButton>
        );
      })}
    </Box>
  );
};
