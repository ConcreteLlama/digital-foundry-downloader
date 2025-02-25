import DownloadIcon from "@mui/icons-material/Download";
import MenuIcon from "@mui/icons-material/Menu";
import VideoCameraIcon from "@mui/icons-material/VideoCameraBack";
import {
  AppBar,
  Box,
  CssBaseline,
  IconButton,
  List,
  SwipeableDrawer,
  Toolbar,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { Outlet } from "react-router-dom";
import { AuthUserInfo } from "../../components/auth/auth-user-info.component";
import { DfUserInfo } from "../../components/df-user-info/df-user-info.component";
import { CumulativeDownloadInfo } from "../../components/tasks/cumulative-download-info.component";
import { selectConfigSectionField } from "../../store/config/config.selector.ts";
import { theme } from "../../themes/theme";
import { SettingsNav } from "../settings/settings-nav.component";
import { ToolsNav } from "../tools/tools-nav.component.tsx";
import { NavItem } from "./nav-item.component";
import { SystemNav } from "../system/system-nav.component.tsx";

export const Nav = () => {
  const useMobileLayout = useMediaQuery(theme.breakpoints.down("md"));
  const useSmallLayout = useMediaQuery(theme.breakpoints.down("sm"));
  const devModeEnabled = useSelector(selectConfigSectionField("dev", "devModeEnabled"));
  const title = `Digital Foundry Content Manager${devModeEnabled ? " (dev mode)" : ""}`;
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const onItemSelected = () => {
    setDrawerOpenState(false);
  };
  return (
    <Box>
      <CssBaseline />
      <AppBar id="app-bar" component="nav" position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar id="toolbar" sx={{ display: "flex", justifyContent: "space-between" }}>
          {useMobileLayout ? (
            <IconButton id="drawer-open-button" onClick={() => setDrawerOpenState(!drawerOpen)}>
              <MenuIcon />
            </IconButton>
          ) : (
            <Typography variant="h6" sx={{ textAlign: "center" }}>
              {title}
            </Typography>
          )}
          <CumulativeDownloadInfo />
          <DfUserInfo mode={useSmallLayout ? "minimal" : "full"} />
          <AuthUserInfo mode={useSmallLayout ? "minimal" : "full"} />
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
        onClose={function (): void {
          setDrawerOpenState(false);
        }}
        onOpen={function (): void {
          setDrawerOpenState(true);
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }} id="sidebar">
          <List>
            <NavItem to="/content" text="Content" icon={VideoCameraIcon} onItemSelected={onItemSelected} />
            <NavItem to="/downloads" text="Downloads" icon={DownloadIcon} onItemSelected={onItemSelected} />
            <ToolsNav onItemSelected={onItemSelected} />
            <SettingsNav onItemSelected={onItemSelected} />
            <SystemNav onItemSelected={onItemSelected} />
          </List>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
};

export const NavPage = () => {
  return (
    <Box sx={{ display: "flex", padding: 4 }}>
      <Outlet />
    </Box>
  );
};