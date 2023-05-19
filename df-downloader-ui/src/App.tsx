import { Box, Stack, ThemeProvider, Toolbar } from "@mui/material";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import { AuthPage } from "./components/auth/auth-page.component";
import { DownloadsPage } from "./routes/downloads/downloads.component";
import { DfContentPage } from "./routes/home/home.component";
import { Nav } from "./routes/nav/nav.components";
import { SettingsElement, SettingsPage } from "./routes/settings/settings.component";
import { SettingsRouteElement, isSettingsRoute, settingsRoutes } from "./routes/settings/settings.routes";
import { queryCurrentUser } from "./store/auth-user/auth-user.actions";
import { selectAuthUser } from "./store/auth-user/auth-user.selector";
import { queryServiceInfo } from "./store/service-info/service-info.actions";
import { store } from "./store/store";
import { theme } from "./themes/theme";
import { queryDfUserInfo } from "./store/df-user/df-user.actions";

function App() {
  useEffect(() => {
    store.dispatch(queryCurrentUser.start());
    store.dispatch(queryServiceInfo.start());
    store.dispatch(queryDfUserInfo.start());
  }, []);
  const authUser = useSelector(selectAuthUser);
  return (
    <ThemeProvider theme={theme}>
      {authUser ? (
        <Box sx={{ display: "flex" }}>
          <Nav />
          <Stack sx={{ flexGrow: 1, height: "100vh" }}>
            <Toolbar />
            <Routes>
              <Route index element={<DfContentPage />} />
              <Route path="content" element={<DfContentPage />} />
              <Route path="downloads" element={<DownloadsPage />} />
              <Route path="auth" element={<AuthPage />} />
              <Route element={<SettingsPage />}>{makeRoutes(settingsRoutes.routes)}</Route>
            </Routes>
          </Stack>
        </Box>
      ) : (
        <AuthPage />
      )}
    </ThemeProvider>
  );
}

const makeRoutes = (routes: SettingsRouteElement[]) => {
  const toReturn: React.ReactElement[] = [];
  routes.forEach((route) =>
    isSettingsRoute(route)
      ? toReturn.push(<Route path={route.path} element={<SettingsElement>{route.element}</SettingsElement>} />)
      : toReturn.push(...makeRoutes(route.routes))
  );
  return toReturn;
};

export default App;
