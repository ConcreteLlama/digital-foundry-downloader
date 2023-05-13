import {
  AppBar,
  Typography,
  Toolbar,
  Box,
  List,
  CssBaseline,
  useMediaQuery,
  IconButton,
  SwipeableDrawer,
} from "@mui/material";
import { UserInfo } from "../../components/user-info/user-info.component";
import HomeIcon from "@mui/icons-material/Home";
import DownloadIcon from "@mui/icons-material/Download";
import { NavItem } from "./nav-item.component";
import { SettingsNav } from "../settings/settings-nav.component";
import { CumulativeDownloadInfo } from "../../components/downloads/cumulative-download-info.component";
import { theme } from "../../themes/theme";
import { SyntheticEvent, useState } from "react";
import MenuIcon from "@mui/icons-material/Menu";

export const Nav = () => {
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("md"));
  const useSmallLayout = useMediaQuery(theme.breakpoints.down("sm"));
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const onItemSelected = () => {
    setDrawerOpenState(false);
  };
  return (
    <Box>
      <CssBaseline />
      <AppBar component="nav" position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          {useMobileLayout ? (
            <IconButton onClick={() => setDrawerOpenState(!drawerOpen)}>
              <MenuIcon />
            </IconButton>
          ) : (
            <Typography variant="h6" sx={{ textAlign: "center" }}>
              Digital Foundry Content Manager
            </Typography>
          )}
          <CumulativeDownloadInfo />
          <UserInfo mode={useSmallLayout ? "minimal" : "full"} />
        </Toolbar>
      </AppBar>
      <SwipeableDrawer
        variant={useMobileLayout ? "temporary" : "permanent"}
        open={drawerOpen}
        sx={{
          width: 240,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: 240, boxSizing: "border-box" },
        }}
        onClose={function (event: SyntheticEvent<{}, Event>): void {
          setDrawerOpenState(false);
        }}
        onOpen={function (event: SyntheticEvent<{}, Event>): void {
          setDrawerOpenState(true);
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <List>
            <NavItem to="/" text="Home" icon={HomeIcon} onItemSelected={onItemSelected} />
            <NavItem to="/downloads" text="Downloads" icon={DownloadIcon} onItemSelected={onItemSelected} />
            <SettingsNav onItemSelected={onItemSelected} />
            {/* {makeNavItem("/", "Home", <HomeIcon />)}
            {makeNavItem("/downloads", "Downloads", <DownloadIcon />)}
            {makeNavItem("/settings", "Settings", <SettingsIcon />)} */}
          </List>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
};
