import {
  AppBar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  SwipeableDrawer,
  Chip,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LiveStatusStrip } from "../../components/general/live-status-strip.component";
import { ThemeSwitcher } from "../../components/general/theme-switcher.component";
import { DfLogoIcon } from "../../icons/df-logo.component";
import { selectDevConfigEnabled } from "../../store/config/config.selector.ts";
import { useSwipeNavigation } from "../../hooks/use-swipe-navigation.ts";
import { monoFontFamily, NARROW_RAIL_MAX_WIDTH } from "../../themes/build-theme";
import { getStoredRailState, RailState, storeRailState } from "../../themes/ui-preferences";
import { MobileTabBar } from "./mobile-tab-bar.component";
import { useNavBadge } from "./nav-badges";
import { findDestination, flattenSectionRoutes, getDestinationPath, getPageTitle, NavDestination, navDestinations } from "./nav-destinations";
import { RailFoot } from "./rail-foot.component";
import { SectionNav, SectionNavCompact } from "./section-nav.component";

const EXPANDED_WIDTH = 212;
const ICON_WIDTH = 54;

export type NavProps = {
  onOpenChangelog: () => void;
};

export const Nav = ({ onOpenChangelog }: NavProps) => {
  const theme = useTheme();
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("md"));
  // Narrow desktops (an unfolded foldable is 833) default to the icon rail so
  // the content keeps the width, but it is only a default - see below.
  // One named source rather than a literal that got left behind when md moved
  // from 900 to 720 - which had the 833px foldable and 768px tablets, exactly
  // what C2 existed to fix, defaulting off the old number.
  const [railState, setRailState] = useState<RailState>(() =>
    getStoredRailState(
      typeof window !== "undefined" && window.innerWidth < NARROW_RAIL_MAX_WIDTH ? "icon" : "expanded"
    )
  );
  const [overlayOpen, setOverlayOpen] = useState(false);

  const toggleRail = useCallback(() => {
    setRailState((current) => {
      const next: RailState = current === "expanded" ? "icon" : "expanded";
      storeRailState(next);
      return next;
    });
  }, []);

  // "[" toggles the rail, but only when you aren't typing into something -
  // the content search is a bare input on the busiest page in the app.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) {
        return;
      }
      event.preventDefault();
      toggleRail();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleRail]);

  const collapsed = !useMobileLayout && railState === "icon";
  const width = collapsed ? ICON_WIDTH : EXPANDED_WIDTH;

  const railContent = (
    <RailContents
      collapsed={collapsed}
      onOpenChangelog={onOpenChangelog}
      onItemSelected={() => setOverlayOpen(false)}
      onToggleRail={useMobileLayout ? undefined : toggleRail}
    />
  );

  return (
    <>
      <AppTopBar
        railWidth={useMobileLayout ? 0 : width}
        showMenuButton={useMobileLayout}
        onMenuClick={() => setOverlayOpen(true)}
      />
      {useMobileLayout ? (
        <SwipeableDrawer
          variant="temporary"
          open={overlayOpen}
          onClose={() => setOverlayOpen(false)}
          onOpen={() => setOverlayOpen(true)}
          ModalProps={{ keepMounted: true }}
          PaperProps={{ sx: { width: EXPANDED_WIDTH, boxSizing: "border-box" } }}
        >
          {railContent}
        </SwipeableDrawer>
      ) : null}
      {useMobileLayout && <MobileTabBar />}
      {!useMobileLayout && (
        <Drawer
          variant="permanent"
          sx={{ width, flexShrink: 0 }}
          // Set on the paper directly rather than through a `& .MuiDrawer-paper`
          // descendant selector in the root's sx - that rule loses to the
          // paper's own generated class, so the rail root would collapse while
          // the panel inside it stayed full width.
          PaperProps={{
            sx: {
              width,
              boxSizing: "border-box",
              overflowX: "hidden",
              transition: theme.transitions.create("width", { duration: theme.transitions.duration.shorter }),
            },
          }}
        >
          {railContent}
        </Drawer>
      )}
    </>
  );
};

type RailContentsProps = {
  collapsed: boolean;
  onOpenChangelog: () => void;
  onItemSelected: () => void;
  /** Absent on mobile, where the rail is an overlay and has nothing to collapse to. */
  onToggleRail?: () => void;
};

const RailContents = ({ collapsed, onOpenChangelog, onItemSelected, onToggleRail }: RailContentsProps) => {
  const { pathname } = useLocation();
  const devModeEnabled = useSelector(selectDevConfigEnabled);
  const active = findDestination(pathname);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/*
        The lockup: the DF glyph carries the "DF" so the words don't have to,
        and "Content Manager" says what the app does now that downloading is
        one pipeline step among several. No tagline - a second line only earns
        its place if it carries data, which is what the foot strip is for.

        It is also the rail control. A separate hamburger at the foot was
        undiscoverable at icon width, where the nav labels are hover tooltips
        that a touch device never triggers - the mark is the thing people
        actually reach for, and it is a much larger target. It doesn't link to
        /content any more; the Content item directly below it already does.
      */}
      <Tooltip title={onToggleRail ? (collapsed ? "Expand sidebar  [" : "Collapse sidebar  [") : ""} placement="right">
        <Box
          component="button"
          onClick={onToggleRail ?? onItemSelected}
          aria-label={onToggleRail ? (collapsed ? "Expand sidebar" : "Collapse sidebar") : "Close menu"}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            width: "100%",
            height: 64,
            paddingX: collapsed ? 0 : 2,
            justifyContent: collapsed ? "center" : "flex-start",
            border: "none",
            background: "none",
            font: "inherit",
            textAlign: "left",
            color: "text.primary",
            cursor: "pointer",
            flexShrink: 0,
            "&:hover": { backgroundColor: "action.hover" },
          }}
        >
          <DfLogoIcon sx={{ color: "primary.main", fontSize: 26, flexShrink: 0 }} />
          {!collapsed && (
            <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              Content Manager
            </Typography>
          )}
        </Box>
      </Tooltip>
      <Divider />

      <List sx={{ flex: "1 1 auto", overflowY: "auto", overflowX: "hidden", paddingX: collapsed ? 0.5 : 1 }}>
        {navDestinations.map((destination) => (
          <RailItem
            key={destination.prefix}
            destination={destination}
            collapsed={collapsed}
            selected={active?.prefix === destination.prefix}
            devModeEnabled={devModeEnabled}
            onItemSelected={onItemSelected}
          />
        ))}
      </List>

      <RailFoot collapsed={collapsed} onOpenChangelog={onOpenChangelog} />
    </Box>
  );
};

type RailItemProps = {
  destination: NavDestination;
  collapsed: boolean;
  selected: boolean;
  devModeEnabled?: boolean;
  onItemSelected: () => void;
};

/**
 * Split out of the map because the count badge is a hook. The count is
 * meaningful enough to survive the collapse, so at icon width it becomes a
 * dot on the icon rather than disappearing with the label.
 */
const RailItem = ({ destination, collapsed, selected, devModeEnabled, onItemSelected }: RailItemProps) => {
  const badge = useNavBadge(destination);
  const DestinationIcon = destination.icon;
  const item = (
    <ListItemButton
      component={Link}
      to={getDestinationPath(destination, devModeEnabled)}
      selected={selected}
      onClick={onItemSelected}
      sx={{
        borderRadius: 1,
        marginBottom: 0.25,
        minHeight: 40,
        justifyContent: collapsed ? "center" : "flex-start",
        paddingX: collapsed ? 1 : 1.5,
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: collapsed ? 0 : 34,
          justifyContent: "center",
          color: selected ? "primary.main" : "text.secondary",
        }}
      >
        {collapsed && badge && destination.badge === "activity" ? (
          <Badge variant="dot" color="primary">
            <DestinationIcon fontSize="small" />
          </Badge>
        ) : (
          <DestinationIcon fontSize="small" />
        )}
      </ListItemIcon>
      {!collapsed && (
        <>
          <ListItemText
            primary={destination.label}
            primaryTypographyProps={{
              variant: "body2",
              fontWeight: selected ? 600 : 400,
              color: selected ? "text.primary" : "text.secondary",
            }}
          />
          {badge && (
            <Chip
              label={badge}
              size="small"
              sx={{
                height: 17,
                fontSize: "0.625rem",
                fontFamily: monoFontFamily,
                backgroundColor: "action.hover",
                color: destination.badge === "activity" ? "primary.main" : "text.disabled",
              }}
            />
          )}
        </>
      )}
    </ListItemButton>
  );
  return collapsed ? (
    <Tooltip title={badge ? `${destination.label} (${badge})` : destination.label} placement="right">
      <Box>{item}</Box>
    </Tooltip>
  ) : (
    item
  );
};

type AppTopBarProps = {
  railWidth: number;
  showMenuButton: boolean;
  onMenuClick: () => void;
};

/**
 * Contextual, rather than an app title that vanished below md and left a bare
 * hamburger. The name of where you are on the left, live state on the right.
 */
const AppTopBar = ({ railWidth, showMenuButton, onMenuClick }: AppTopBarProps) => {
  const { pathname } = useLocation();
  return (
    <AppBar
      id="app-bar"
      component="nav"
      position="fixed"
      sx={{
        width: railWidth ? `calc(100% - ${railWidth}px)` : "100%",
        marginLeft: `${railWidth}px`,
        zIndex: (theme) => theme.zIndex.drawer - 1,
      }}
    >
      <Toolbar id="toolbar" sx={{ display: "flex", gap: 2 }}>
        {showMenuButton && (
          // The same control as the rail lockup, in the one place the rail
          // isn't - which also puts the DF mark on mobile, where it otherwise
          // never appeared at all.
          <IconButton
            id="drawer-open-button"
            edge="start"
            onClick={onMenuClick}
            aria-label="Open menu"
            sx={{ width: 44, height: 44 }}
          >
            <DfLogoIcon sx={{ color: "primary.main", fontSize: 24 }} />
          </IconButton>
        )}
        <Typography variant="h6" noWrap sx={{ flex: "1 1 auto", minWidth: 0 }}>
          {getPageTitle(pathname)}
        </Typography>
        <LiveStatusStrip />
        <ThemeSwitcher />
      </Toolbar>
    </AppBar>
  );
};

/**
 * Wrapper for the sectioned routes (Settings/Tools/System). The section's own
 * pages are chosen from a column in here now, not from an accordion in the rail.
 */
export const NavPage = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const devModeEnabled = useSelector(selectDevConfigEnabled);

  /*
    Swiping moves between the section's own pages - the same set the strip
    above the content lists, in the same order. Tools and Analysis are
    where this pays off, since those sections show that strip as their
    only navigation, but it costs nothing to offer it wherever a section
    has more than one page.

    Touch-only by nature, so nothing changes on a desktop that never fires
    these events. See useSwipeNavigation for why a horizontal drag alone
    is not enough to act on - a settings table that scrolls sideways would
    otherwise navigate away instead of scrolling.
  */
  const destination = findDestination(pathname);
  const sectionRoutes = destination?.section
    ? flattenSectionRoutes(destination.section).filter((route) => !route.devOnly || devModeEnabled)
    : [];
  const stepPage = (delta: number) => {
    const index = sectionRoutes.findIndex((route) => route.path === pathname);
    const next = index + delta;
    if (index >= 0 && next >= 0 && next < sectionRoutes.length) {
      navigate(sectionRoutes[next].path);
    }
  };
  const swipe = useSwipeNavigation({ onNext: () => stepPage(1), onPrevious: () => stepPage(-1) });

  return (
    // Grows to fill the scroll area rather than stopping at its content, so
    // a short page still covers the screen - both for the swipe handler and
    // for the save bar a settings page puts at its bottom.
    <Box sx={{ display: "flex", padding: { xs: 1.5, md: 4 }, width: "100%", minWidth: 0, flex: "1 1 auto" }}>
      <SectionNav />
      {/* A column, so the page inside can grow to fill it rather than
          depending on a percentage height resolving against a box that only
          has a stretched one - which it does not do reliably, and was why
          the settings save bar sat under the content on desktop. */}
      <Box sx={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }} {...swipe}>
        <SectionNavCompact />
        <Outlet />
      </Box>
    </Box>
  );
};
