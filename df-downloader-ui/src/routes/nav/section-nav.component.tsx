import { Box, List, ListItemButton, ListItemIcon, ListItemText, Tooltip, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { selectDevConfigEnabled } from "../../store/config/config.selector";
import { useDirtySections } from "../../components/settings/dirty-sections";
import { findDestination, flattenSectionRoutes, groupSectionRoutes } from "./nav-destinations";
import { NestedRoute } from "./nested-routes";

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
  if (destination.section.compactNavOnly) {
    // This section renders its links inline instead - see NestedSubRoute.
    return null;
  }
  const routes = flattenSectionRoutes(destination.section).filter((r) => !r.devOnly || devModeEnabled);
  if (routes.length <= 1) {
    // A single-page section doesn't need a column to choose from.
    return null;
  }
  // Headings kept, unlike the flat list above - fourteen settings pages in one
  // run is a wall to read rather than a list to scan. Groups that empty out
  // once dev-only pages are hidden are dropped, so no heading stands alone.
  const groups = groupSectionRoutes(destination.section)
    .map((group) => ({ ...group, routes: group.routes.filter((r) => !r.devOnly || devModeEnabled) }))
    .filter((group) => group.routes.length > 0);
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
        // lg, not md: the column costs 208px plus a gutter, which at md
        // (900px) leaves the page itself cramped. It also matches
        // SettingsElement, which already treats lg as the width where a
        // settings page stops needing the whole screen.
        display: { xs: "none", lg: "block" },
      }}
    >
      <Typography variant="overline" sx={{ paddingLeft: 2 }}>
        {destination.label}
      </Typography>
      {groups.map((group) => (
        <Box key={group.label ?? "__ungrouped"} sx={{ marginBottom: 1.5 }}>
          {group.label && (
            <Typography
              variant="overline"
              sx={{ display: "block", paddingLeft: 2, color: "text.disabled", lineHeight: 2 }}
            >
              {group.label}
            </Typography>
          )}
          <List dense disablePadding>
            {group.routes.map((route) => {
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
      ))}
    </Box>
  );
};

/**
 * Below md the column would eat the page, so the section's pages become a
 * horizontal scroller above the content instead.
 */
/**
 * Below lg the column would eat the page, so a section's pages appear above
 * the content instead - as two rows where the section is grouped.
 *
 * One row of fourteen was a list to be scrolled through rather than navigated,
 * and labelling the groups inline did not fix that: the labels scrolled away
 * with everything else and it still read as one run. Picking the group first
 * means each row is three or four things, which is a choice rather than a
 * search. Sections with no groups keep the single row - there is nothing to
 * pick between.
 */
export const SectionNavCompact = () => {
  const { pathname } = useLocation();
  const devModeEnabled = useSelector(selectDevConfigEnabled);
  const selectedRef = useRef<HTMLAnchorElement | null>(null);

  /*
    Bring the current page into view in the strip.

    The strip scrolls, and the selected page is often not in the part of
    it you can see - reaching Media Formats leaves the strip still showing
    Digital Foundry and its neighbours, so nothing on screen says where
    you are. That got worse with swipe navigation, where you can move
    several pages without ever touching the strip.

    Nearest rather than centred, so it only moves when it has to.
  */
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);
  const destination = findDestination(pathname);
  if (!destination?.section) {
    return null;
  }
  const routes = flattenSectionRoutes(destination.section).filter((r) => !r.devOnly || devModeEnabled);
  if (routes.length <= 1) {
    return null;
  }
  const groups = groupSectionRoutes(destination.section)
    .map((group) => ({ ...group, routes: group.routes.filter((r) => !r.devOnly || devModeEnabled) }))
    .filter((group) => group.routes.length > 0);
  const grouped = groups.length > 1 && groups.every((group) => group.label);
  // Falls back to the first group rather than nothing, so the second row is
  // never empty while the router settles on a path.
  const activeGroup = groups.find((group) => group.routes.some((route) => route.path === pathname)) ?? groups[0];
  const pageRoutes = grouped ? activeGroup.routes : routes;

  const strip = (children: React.ReactNode, extraSx?: object) => (
    <Box sx={{ display: "flex", gap: 1, overflowX: "auto", ...extraSx }}>{children}</Box>
  );

  const pageButton = (route: NestedRoute) => {
    const selected = pathname === route.path;
    return (
      <ListItemButton
        key={route.path}
        ref={selected ? selectedRef : undefined}
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
  };

  return (
    <Box
      sx={{
        // Normally the small-screen alternative to the column, but the
        // only nav for a section that opted out of the column entirely.
        display: destination.section.compactNavOnly ? "flex" : { xs: "flex", lg: "none" },
        flexDirection: "column",
        gap: 0.5,
        paddingBottom: 1,
        marginBottom: 2,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      {grouped &&
        strip(
          groups.map((group) => {
            const selected = group === activeGroup;
            return (
              <ListItemButton
                key={group.label}
                component={Link}
                // Selecting a group lands on its first page, so the choice
                // always resolves to something real.
                to={group.routes[0].path}
                selected={selected}
                sx={{ borderRadius: 1, flex: "0 0 auto", paddingY: 0.25 }}
              >
                <ListItemText
                  primary={group.label}
                  primaryTypographyProps={{
                    variant: "overline",
                    noWrap: true,
                    lineHeight: 1.6,
                    fontWeight: selected ? 700 : 400,
                    color: selected ? "text.primary" : "text.disabled",
                  }}
                />
              </ListItemButton>
            );
          })
        )}
      {strip(pageRoutes.map(pageButton))}
    </Box>
  );
};
