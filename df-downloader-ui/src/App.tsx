import { Box, Stack, ThemeProvider, Toolbar } from "@mui/material";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Route, Routes } from "react-router-dom";
import { AppNotReadyPage } from "./AppNotReadyPage.tsx";
import { AuthPage } from "./components/auth/auth-page.component";
import { DownloadsPage } from "./routes/downloads/downloads.component";
import { DfContentPage } from "./routes/home/home.component";
import { Nav, NavPage } from "./routes/nav/nav.components";
import { isNestedRoute, NestedRouteElement } from "./routes/nav/nested-routes.tsx";
import { settingsRouteDefinitions } from "./routes/settings/settings.routes";
import { systemRouteDefinitions } from "./routes/system/system.routes.tsx";
import { toolsRouteDefinitions } from "./routes/tools/tools.routes.tsx";
import { queryCurrentUser } from "./store/auth-user/auth-user.actions";
import { selectAuthUser } from "./store/auth-user/auth-user.selector";
import { queryConfigSection } from "./store/config/config.action.ts";
import { queryDfUserInfo } from "./store/df-user/df-user.actions";
import { selectIsLoading } from "./store/general.selector.ts";
import { queryServiceInfo } from "./store/service-info/service-info.actions";
import { selectServiceError } from "./store/service-info/service-info.selector.ts";
import { store } from "./store/store";
import { subscribeToChannel } from "./store/realtime/realtime-stream.ts";
import { queryTasks } from "./store/df-tasks/tasks.action.ts";
import { theme } from "./themes/theme";
import registerTaskSnackbarTriggers from "./components/tasks/task-snackbar-triggers.tsx";
import { BranchCheckDialog } from "./components/general/branch-check.component.tsx";
import { ManualDownloadFloatingButton } from "./components/df-content/manual-download-fab.component.tsx";
import { dfDownloaderBranch } from "df-downloader-common";

function App() {
  return (
    <ThemeProvider theme={theme}>
      <MainContainer />
    </ThemeProvider>
  );
}

const MainContainer = () => {
  useEffect(() => {
    const unregister = registerTaskSnackbarTriggers();
    return () => unregister();
  }, []);
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
  // The service starts serving HTTP before its startup Digital Foundry auth
  // re-check finishes - that check hits digitalfoundry.net through a
  // rate-limited queue, so it can take several seconds. During that window
  // GET /df-user returns the last-persisted user info, which for an existing
  // install is a stale "signed in" value, so the very first query can cache a
  // signed-in state that's actually invalid and the "Not Connected" dialog
  // would then never open (confirmed 2026-08-18 as the reason a bad cookie in
  // an existing install's config silently produced no prompt). Re-poll a few
  // times over the first ~40s once the user is into the app so the UI
  // self-corrects to the real auth state once the backend's check completes -
  // harmless for a genuinely signed-in user (the polls just re-confirm the
  // same info).
  useEffect(() => {
    if (!authUser) {
      return;
    }
    let polls = 0;
    const maxPolls = 8;
    const interval = setInterval(() => {
      const dfUserState = store.getState().dfUserInfo;
      if (dfUserState.loading) {
        // An authoritative check is already in flight - most notably the
        // settings form's own await-login check when the user just saved a
        // new session ID, which can take a while since it goes through the
        // same rate-limited queue as everything else. Firing a second,
        // independent request here could resolve out of order relative to
        // that one and flicker the "Not Connected" dialog back open even
        // after a valid ID was just confirmed (confirmed live 2026-08-18) -
        // so just wait for whatever's in flight to finish rather than
        // competing with it.
        return;
      }
      if (dfUserState.userInfo) {
        // Already confirmed signed in - nothing left to self-correct.
        // DfUserManager's own periodic recheck (every 30 minutes) handles
        // noticing a later organic expiry; this loop only exists to catch
        // up with the backend's slower one-time startup check.
        clearInterval(interval);
        return;
      }
      polls += 1;
      store.dispatch(queryDfUserInfo.start());
      if (polls >= maxPolls) {
        clearInterval(interval);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [authUser]);
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
const systemRoutes = makeRoutes(systemRouteDefinitions.routes);

const MainApp = () => {
  useEffect(() => {
    store.dispatch(queryConfigSection.start("dev"));
  }, []);
  // Was an unconditional 1s poll. The backend pushes a snapshot on every
  // task/pipeline change now, and samples for download progress only while
  // something is actually running - so an idle app makes no requests at all.
  // Falls back to the old polling behaviour if the stream can't be held open.
  useEffect(
    () => subscribeToChannel("tasks", (tasks) => store.dispatch(queryTasks.success(tasks))),
    []
  );
  return (
    <Box sx={{ display: "flex", width: "100vw" }} key="main-app">
      {dfDownloaderBranch !== 'main' && <BranchCheckDialog />}
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
        <Toolbar id="toolbar-spacer" />
        <Routes>
          <Route key="route-index" id="route-index" index element={<DfContentPage />} />
          <Route key="route-df-content" id="route-df-content" path="content" element={<DfContentPage />} />
          <Route key="route-downloads" id="route-downloads" path="downloads" element={<DownloadsPage />} />
          <Route key="route-auth" id="route-auth" path="auth" element={<AuthPage />} />
          <Route key="route-settings" id="route-settings" element={<NavPage />}>
            {settingsRoutes}
          </Route>
          <Route key="route-tools" id="route-tools" element={<NavPage />}>
            {toolsRoutes}
          </Route>
          <Route key="route-system" id="route-system" element={<NavPage />}>
            {systemRoutes}
          </Route>
        </Routes>
      </Stack>
      <ManualDownloadFloatingButton />
    </Box>
  );
};

export default App;
