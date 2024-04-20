import PasswordIcon from "@mui/icons-material/Password";
import LogoutIcon from "@mui/icons-material/Logout";
import DevIcon from "@mui/icons-material/DeveloperMode";
import { Avatar, Box, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { logout } from "../../store/auth-user/auth-user.actions";
import { selectAuthUser } from "../../store/auth-user/auth-user.selector";
import { store } from "../../store/store";
import { ChangePasswordFormDialog } from "./change-password-dialog.component";
import { selectConfigSectionField } from "../../store/config/config.selector.ts";

export type AuthUserInfoProps = {
  mode: "full" | "minimal";
};
export const AuthUserInfo = ({ mode }: AuthUserInfoProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const devModeEnabled = useSelector(selectConfigSectionField("dev", "devModeEnabled"));
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const user = useSelector(selectAuthUser);
  return user ? (
    <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <ChangePasswordFormDialog onClose={() => setChangePasswordOpen(false)} open={changePasswordOpen} />
      {mode === "full" && <Typography>{`${user.id}${devModeEnabled ? " (dev)" : ""}`}</Typography>}
      <IconButton onClick={handleClick}>{devModeEnabled ? <DevIcon /> : <Avatar />}</IconButton>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        <MenuItem
          onClick={() => {
            handleClose();
            setChangePasswordOpen(true);
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, width: "100%" }}>
            Change Password
            <PasswordIcon fontSize="small" />
          </Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleClose();
            store.dispatch(logout.start());
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, width: "100%" }}>
            Logout
            <LogoutIcon fontSize="small" />
          </Box>
        </MenuItem>
      </Menu>
    </Box>
  ) : (
    <Typography>Not signed in (THIS IS A BUG)</Typography>
  );
};
