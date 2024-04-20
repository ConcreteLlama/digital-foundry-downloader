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
import { selectIsLoading } from "./store/general.selector.ts";
import { selectServiceError } from "./store/service-info/service-info.selector.ts";
import { AppNotReadyPage } from "./AppNotReadyPage.tsx";
import { queryConfigSection } from "./store/config/config.action.ts";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <MainContainer />
    </ThemeProvider>
  );
}

const MainContainer = () => {
  useEffect(() => {
    store.dispatch(queryServiceInfo.start());
  }, []);
  const loading = useSelector(selectIsLoading("serviceInfo"));
  const serviceError = useSelector(selectServiceError);
  useEffect(() => {
    store.dispatch(queryCurrentUser.start());
    store.dispatch(queryDfUserInfo.start());
  }, [serviceError]);
  const authUser = useSelector(selectAuthUser);
  return loading || (serviceError && !serviceError.details) ? (
    <AppNotReadyPage />
  ) : authUser ? (
    <MainApp />
  ) : (
    <AuthPage />
  );
};

const makeRoutes = (routes: SettingsRouteElement[]) => {
  const toReturn: React.ReactElement[] = [];
  routes.forEach((route) =>
    isSettingsRoute(route)
      ? toReturn.push(<Route path={route.path} element={<SettingsElement>{route.element}</SettingsElement>} />)
      : toReturn.push(...makeRoutes(route.routes))
  );
  return toReturn;
};
const routes = makeRoutes(settingsRoutes.routes);

const MainApp = () => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start("dev"));
  }, []);
  return (
    <Box sx={{ display: "flex", width: "100vw" }}>
      <Nav />
      <Stack
        sx={{
          flex: "1 1 auto",
          height: "100vh",
          overflow: "auto",
          "::-webkit-scrollbar": {
            display: "none",
          },
        }}
      >
        <Toolbar />
        <Routes>
          <Route index element={<DfContentPage />} />
          <Route path="content" element={<DfContentPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="auth" element={<AuthPage />} />
          <Route element={<SettingsPage />}>{routes}</Route>
        </Routes>
      </Stack>
    </Box>
  );
};

export default App;
