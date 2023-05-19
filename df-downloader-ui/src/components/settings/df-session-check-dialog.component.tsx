import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, useMediaQuery } from "@mui/material";
import { useState } from "react";
import { useSelector } from "react-redux";
import { selectDfUserInfo } from "../../store/df-user/df-user.selector";
import { theme } from "../../themes/theme";
import { DfSettingsForm } from "./df-settings.component";

export const DfSessionCheckDialog = () => {
  const dfUser = useSelector(selectDfUserInfo);
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
  return (
    <Dialog open={open} fullWidth={true} maxWidth={"md"} fullScreen={fullScreen}>
      <DialogTitle>Not Connected to DigitalFoundry.net</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
          <DfSettingsForm />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>That's fine, I'm just browsing</Button>
      </DialogActions>
    </Dialog>
  );
};
