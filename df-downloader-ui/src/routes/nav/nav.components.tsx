import { AppBar, Typography, Toolbar, Box, Drawer, List, CssBaseline } from "@mui/material";
import { UserInfo } from "../../components/user-info/user-info.component";
import HomeIcon from "@mui/icons-material/Home";
import DownloadIcon from "@mui/icons-material/Download";
import { NavItem } from "./nav-item.component";
import { SettingsNav } from "../settings/settings-nav.component";
import { CumulativeDownloadInfo } from "../../components/downloads/cumulative-download-info.component";

export const Nav = () => {
  return (
    <Box>
      <CssBaseline />
      <AppBar component="nav" position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography variant="h6" sx={{ textAlign: "center" }}>
            Digital Foundry Content Manager
          </Typography>
          <CumulativeDownloadInfo />
          <UserInfo />
        </Toolbar>
      </AppBar>
      <Toolbar />
      <Drawer
        variant="permanent"
        sx={{
          width: 240,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: 240, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto" }}>
          <List>
            <NavItem to="/" text="Home" icon={HomeIcon} />
            <NavItem to="/downloads" text="Downloads" icon={DownloadIcon} />
            <SettingsNav />
            {/* {makeNavItem("/", "Home", <HomeIcon />)}
            {makeNavItem("/downloads", "Downloads", <DownloadIcon />)}
            {makeNavItem("/settings", "Settings", <SettingsIcon />)} */}
          </List>
        </Box>
      </Drawer>
    </Box>
  );
};
