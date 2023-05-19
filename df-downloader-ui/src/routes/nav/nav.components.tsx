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
  useMediaQuery,
} from "@mui/material";
import { SyntheticEvent, useState } from "react";
import { AuthUserInfo } from "../../components/auth/auth-user-info.component";
import { DfUserInfo } from "../../components/df-user-info/df-user-info.component";
import { CumulativeDownloadInfo } from "../../components/downloads/cumulative-download-info.component";
import { theme } from "../../themes/theme";
import { SettingsNav } from "../settings/settings-nav.component";
import { NavItem } from "./nav-item.component";

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
            <NavItem to="/content" text="Content" icon={VideoCameraIcon} onItemSelected={onItemSelected} />
            <NavItem to="/downloads" text="Downloads" icon={DownloadIcon} onItemSelected={onItemSelected} />
            <SettingsNav onItemSelected={onItemSelected} />
          </List>
        </Box>
      </SwipeableDrawer>
    </Box>
  );
};
