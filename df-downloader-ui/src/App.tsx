import { ThemeProvider } from "@mui/material";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import { DownloadsPage } from "./routes/downloads/downloads.component";
import { HomePage } from "./routes/home/home.component";
import { Nav } from "./routes/nav/nav.components";
import { SettingsPage } from "./routes/settings/settings.component";
import { theme } from "./themes/theme";
import { Box, Toolbar } from "@mui/material";
import { SettingsRouteElement, isSettingsRoute, settingsRoutes } from "./routes/settings/settings.routes";
import { useEffect } from "react";
import { store } from "./store/store";
import { queryServiceInfo } from "./store/service-info/service-info.actions";

function App() {
  useEffect(() => {
    store.dispatch(queryServiceInfo.start());
  }, []);
  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: "flex" }}>
        <Nav />
        <Box>
          <Toolbar />
          <Routes>
            <Route index element={<HomePage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route element={<SettingsPage />}>{makeRoutes(settingsRoutes.routes)}</Route>
          </Routes>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

const makeRoutes = (routes: SettingsRouteElement[]) => {
  const toReturn: React.ReactElement[] = [];
  routes.forEach((route) =>
    isSettingsRoute(route)
      ? toReturn.push(<Route path={route.path} element={route.element} />)
      : toReturn.push(...makeRoutes(route.routes))
  );
  return toReturn;
};

export default App;
