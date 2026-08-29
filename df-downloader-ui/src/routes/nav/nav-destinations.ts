import ComputerIcon from "@mui/icons-material/Computer";
import InsightsIcon from "@mui/icons-material/Insights";
import DownloadIcon from "@mui/icons-material/Download";
import HandymanIcon from "@mui/icons-material/Handyman";
import SettingsIcon from "@mui/icons-material/Settings";
import VideoCameraIcon from "@mui/icons-material/VideoCameraBack";
import { SvgIconProps } from "@mui/material";
import { analysisRouteDefinitions } from "../analysis/analysis.routes";
import { settingsRouteDefinitions } from "../settings/settings.routes";
import { systemRouteDefinitions } from "../system/system.routes";
import { toolsRouteDefinitions } from "../tools/tools.routes";
import { isNestedRoute, NestedRoute, NestedSubRoute } from "./nested-routes";

/**
 * The six top-level places you can be. The rail holds exactly these - the
 * sections' own pages are reached from a sub-nav inside the page, not from a
 * nested accordion in a 240px column.
 */
export type NavDestination = {
  /** Which live count, if any, the rail shows against this destination. */
  badge?: "content" | "activity";
  /** Path prefix owned by this destination, used for active-state matching. */
  prefix: string;
  label: string;
  icon: React.FC<SvgIconProps>;
  /** Present for destinations that are a section of pages rather than one page. */
  section?: NestedSubRoute;
  /** Only used when there is no section to take a first route from. */
  path?: string;
};

export const navDestinations: NavDestination[] = [
  { prefix: "/content", label: "Content", icon: VideoCameraIcon, path: "/content", badge: "content" },
  // Renamed from "Downloads": the page lists scheduled items, running
  // pipelines, post-processing and completed runs, most of which are not
  // downloads - and "Downloads" already means a different thing as a settings
  // section. The path is left alone so existing links and bookmarks still work.
  { prefix: "/downloads", label: "Activity", icon: DownloadIcon, path: "/downloads", badge: "activity" },
  { prefix: "/analysis", label: "Analysis", icon: InsightsIcon, section: analysisRouteDefinitions },
  { prefix: "/tools", label: "Tools", icon: HandymanIcon, section: toolsRouteDefinitions },
  { prefix: "/settings", label: "Settings", icon: SettingsIcon, section: settingsRouteDefinitions },
  { prefix: "/system", label: "System", icon: ComputerIcon, section: systemRouteDefinitions },
];

/** Flattens a section's (possibly nested) route tree into the pages it holds. */
export const flattenSectionRoutes = (section: NestedSubRoute): NestedRoute[] =>
  section.routes.flatMap((route) => (isNestedRoute(route) ? [route] : flattenSectionRoutes(route)));

/**
 * Where a rail item points. A section navigates to its first page, so clicking
 * "Settings" lands somewhere real rather than on an empty shell.
 */
export const getDestinationPath = (destination: NavDestination, devModeEnabled?: boolean): string => {
  if (destination.path) {
    return destination.path;
  }
  const routes = flattenSectionRoutes(destination.section!).filter((r) => !r.devOnly || devModeEnabled);
  return routes[0]?.path ?? "/";
};

export const findDestination = (pathname: string): NavDestination | undefined =>
  navDestinations.find((d) => pathname === d.prefix || pathname.startsWith(`${d.prefix}/`));

/** The name to show in the top bar for wherever we currently are. */
export const getPageTitle = (pathname: string): string => {
  const destination = findDestination(pathname);
  if (!destination) {
    return "Content";
  }
  if (!destination.section) {
    return destination.label;
  }
  const page = flattenSectionRoutes(destination.section).find((r) => r.path === pathname);
  return page ? `${destination.label} · ${page.name}` : destination.label;
};
