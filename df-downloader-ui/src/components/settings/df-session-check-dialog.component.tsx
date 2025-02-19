import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery } from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectDfUserInfo } from "../../store/df-user/df-user.selector";
import { selectIsLoading } from "../../store/general.selector.ts";
import { theme } from "../../themes/theme";
import { Loading } from "../general/loading.component.tsx";
import { DfSettingsForm } from "./df-settings.component";

export const DfSessionCheckDialog = () => {
  const dfUser = useSelector(selectDfUserInfo);
  const userInfoLoading = useSelector(selectIsLoading("dfUserInfo"));
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [ignoreDfSessionCheck, setIgnoreDfSessionCheck] = useState(
    window.sessionStorage.getItem("ignoreDfSessionCheck") === "true"
  );
  const userExists = Boolean(dfUser);
  const open = !userExists && !ignoreDfSessionCheck;
  const onClose = () => {
    window.sessionStorage.setItem("ignoreDfSessionCheck", "true");
    setIgnoreDfSessionCheck(true);
  };
  const title = userInfoLoading ? "Checking DigitalFoundry.net Connection" : "Not Connected to DigitalFoundry.net";
  return (
    <Dialog open={open} fullWidth={true} maxWidth={"md"} fullScreen={fullScreen} id="df-session-check-dialog">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          {userInfoLoading ? (
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
