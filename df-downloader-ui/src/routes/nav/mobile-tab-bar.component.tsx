import { MOBILE_TAB_BAR_HEIGHT } from "./nav-metrics.ts";
import { Badge, BottomNavigation, BottomNavigationAction, Paper } from "@mui/material";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { selectDevConfigEnabled } from "../../store/config/config.selector";
import { useNavBadge } from "./nav-badges";
import { findDestination, getDestinationPath, NavDestination, navDestinations } from "./nav-destinations";

/** Height reserved for the bar, so page content and the FAB can clear it. */
export { MOBILE_TAB_BAR_HEIGHT } from "./nav-metrics.ts";

/**
 * On a phone the five destinations are worth a permanent bar - reaching them
 * through a hamburger and an overlay is two gestures for something you do
 * constantly. The overlay rail stays for the account, version and connection
 * state, which have nowhere else to live at this width.
 */
export const MobileTabBar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const devModeEnabled = useSelector(selectDevConfigEnabled);
  const active = findDestination(pathname);

  return (
    <Paper
      elevation={0}
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: "1px solid",
        borderColor: "divider",
        display: { xs: "block", md: "none" },
      }}
    >
      <BottomNavigation
        showLabels
        value={active?.prefix ?? false}
        onChange={(_, prefix) => {
          const destination = navDestinations.find((d) => d.prefix === prefix);
          if (destination) {
            navigate(getDestinationPath(destination, devModeEnabled));
          }
        }}
        sx={{ height: MOBILE_TAB_BAR_HEIGHT, backgroundColor: "transparent" }}
      >
        {navDestinations.map((destination) => (
          <TabAction key={destination.prefix} destination={destination} />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

/**
 * Split out because the badge count is a hook, and hooks can't be called from
 * inside a map callback in the parent.
 */
const TabAction = ({ destination, ...rest }: { destination: NavDestination }) => {
  const badge = useNavBadge(destination);
  const DestinationIcon = destination.icon;
  return (
    <BottomNavigationAction
      {...rest}
      value={destination.prefix}
      label={destination.label}
      icon={
        // Only the activity count is worth carrying here - the content total
        // runs to four digits and would swamp a 56px tab.
        destination.badge === "activity" && badge ? (
          <Badge badgeContent={badge} color="primary">
            <DestinationIcon fontSize="small" />
          </Badge>
        ) : (
          <DestinationIcon fontSize="small" />
        )
      }
      sx={{ minWidth: 0, paddingX: 0.5, "& .MuiBottomNavigationAction-label": { fontSize: "0.625rem" } }}
    />
  );
};
