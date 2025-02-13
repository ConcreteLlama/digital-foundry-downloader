import { Box, Stack, ThemeProvider, Toolbar } from "@mui/material";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import "./App.css";
import { AppNotReadyPage } from "./AppNotReadyPage.tsx";
import { AuthPage } from "./components/auth/auth-page.component";
import { DownloadsPage } from "./routes/downloads/downloads.component";
import { DfContentPage } from "./routes/home/home.component";
import { Nav, NavPage } from "./routes/nav/nav.components";
import { isNestedRoute, NestedRouteElement } from "./routes/nav/nested-routes.tsx";
import { settingsRouteDefinitions } from "./routes/settings/settings.routes";
import { toolsRouteDefinitions } from "./routes/tools/tools.routes.tsx";
import { queryCurrentUser } from "./store/auth-user/auth-user.actions";
import { selectAuthUser } from "./store/auth-user/auth-user.selector";
import { queryConfigSection } from "./store/config/config.action.ts";
import { queryDfUserInfo } from "./store/df-user/df-user.actions";
import { selectIsLoading } from "./store/general.selector.ts";
import { queryServiceInfo } from "./store/service-info/service-info.actions";
import { selectServiceError } from "./store/service-info/service-info.selector.ts";
import { store } from "./store/store";
import { theme } from "./themes/theme";
import { setIntervalImmediate } from "./utils/timer.ts";
import { queryTasks } from "./store/df-tasks/tasks.action.ts";

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

const makeRoutes = (routes: NestedRouteElement[]) => {
  const toReturn: React.ReactElement[] = [];
  routes.forEach((route) =>
    isNestedRoute(route)
      ? toReturn.push(
        <Route
          key={`route-${route.path}`}
          path={route.path}
          element={route.element}
        />
      )
      : toReturn.push(...makeRoutes(route.routes))
  );
  return toReturn;
};
const settingsRoutes = makeRoutes(settingsRouteDefinitions.routes);
const toolsRoutes = makeRoutes(toolsRouteDefinitions.routes);

const MainApp = () => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start("dev"));
  }, []);
  useEffect(() => {
    const interval = setIntervalImmediate(() => {
      store.dispatch(queryTasks.start());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);
  return (
    <Box sx={{ display: "flex", width: "100vw" }} key="main-app">
      <Nav />
      <Stack
        key={"main-app-stack"}
        id="main-app-stack"
        sx={{
          flex: "1 1 auto",
          height: "100vh",
          overflow: "auto",
          "::-webkit-scrollbar": {
            display: "none",
          },
        }}
      >
        <Toolbar id="toolbar-spacer"/>
        <Routes>
          <Route key="route-index" id="route-index" index element={<DfContentPage />}/>
          <Route key="route-df-content" id="route-df-content" path="content" element={<DfContentPage />} />
          <Route key="route-downloads" id="route-downloads" path="downloads" element={<DownloadsPage />} />
          <Route key="route-auth" id="route-auth" path="auth" element={<AuthPage />} />
          <Route key="route-settings" id="route-settings" element={<NavPage />}>
            {settingsRoutes}
          </Route>
          <Route key="route-tools" id="route-tools" element={<NavPage />}>
            {toolsRoutes}
          </Route>
        </Routes>
      </Stack>
    </Box>
  );
};

export default App;
