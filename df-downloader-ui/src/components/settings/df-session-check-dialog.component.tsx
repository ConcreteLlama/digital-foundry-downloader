import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery,
  useTheme } from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectDfUserInfo, selectDfUserInfoInitialized } from "../../store/df-user/df-user.selector";
import { selectIsLoading } from "../../store/general.selector.ts";
import { Loading } from "../general/loading.component.tsx";
import { DfSettingsForm } from "./df-settings.component";

export const DfSessionCheckDialog = () => {
  const dfUser = useSelector(selectDfUserInfo);
  const userInfoLoading = useSelector(selectIsLoading("dfUserInfo"));
  const userInfoInitialized = useSelector(selectDfUserInfoInitialized);
  // Only the very first check should show the blocking "Checking..." spinner
  // - App.tsx re-polls this in the background every few seconds after load
  // (to self-correct once the service's own slower startup auth check
  // settles), which also flips `loading` true. Without gating on
  // `initialized`, every background poll swapped this dialog's content back
  // to the spinner mid-typing, wiping out whatever the user had just typed
  // into the settings form below (confirmed live 2026-08-18).
  const showChecking = userInfoLoading && !userInfoInitialized;
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [ignoreDfSessionCheck, setIgnoreDfSessionCheck] = useState(
    window.sessionStorage.getItem("ignoreDfSessionCheck") === "true"
  );
  const userExists = Boolean(dfUser);
  // Re-enabled 2026-08-14 for the new autologin-cookie flow - the tool should
  // never silently scan the new site's archive unauthenticated (it's
  // partially browsable logged-out, but that's not useful data), so this
  // blocks the main UI until a valid autologin cookie is confirmed, or the
  // user explicitly says they're just browsing.
  const open = !userExists && !ignoreDfSessionCheck;
  const onClose = () => {
    window.sessionStorage.setItem("ignoreDfSessionCheck", "true");
    setIgnoreDfSessionCheck(true);
  };
  const title = showChecking ? "Checking DigitalFoundry.net Connection" : "Not Connected to DigitalFoundry.net";
  return (
    <Dialog open={open} fullWidth={true} maxWidth={"md"} fullScreen={fullScreen} id="df-session-check-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {showChecking ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
              <Loading message="Checking DigitalFoundry.net Connection..." />
            </Box>
          ) : (
            <DfSettingsForm />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>That's fine, I'm just browsing</Button>
      </DialogActions>
    </Dialog>
  );
};
