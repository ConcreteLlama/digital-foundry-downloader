import PasswordIcon from "@mui/icons-material/Password";
import LogoutIcon from "@mui/icons-material/Logout";
import DevIcon from "@mui/icons-material/DeveloperMode";
import { Avatar, Badge, Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { logout } from "../../store/auth-user/auth-user.actions";
import { selectAuthUser } from "../../store/auth-user/auth-user.selector";
import { store } from "../../store/store";
import { ChangePasswordFormDialog } from "./change-password-dialog.component";
import { selectConfigSectionField } from "../../store/config/config.selector.ts";

export type AuthUserInfoProps = {
  mode: "full" | "minimal";
  /**
   * Optional dot on the avatar. Used by the nav rail to keep the Digital
   * Foundry connection state visible once the rail collapses and the status
   * strip that normally carries it is gone.
   */
  statusColour?: string;
  statusTooltip?: string;
  /** Rendered above the menu items - the collapsed rail puts the version here. */
  menuHeader?: React.ReactNode;
};
export const AuthUserInfo = ({ mode, statusColour, statusTooltip, menuHeader }: AuthUserInfoProps) => {
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
      <ChangePasswordFormDialog onClose={() => setChangePasswordOpen(false)} open={changePasswordOpen}/>
      {mode === "full" && <Typography>{`${user.id}${devModeEnabled ? " (dev)" : ""}`}</Typography>}
      <IconButton onClick={handleClick}>{renderAvatar(devModeEnabled, statusColour, statusTooltip)}</IconButton>
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {menuHeader && (
          <Box sx={{ paddingX: 2, paddingY: 1 }}>
            {menuHeader}
            <Divider sx={{ marginTop: 1 }} />
          </Box>
        )}
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

const renderAvatar = (devModeEnabled: boolean | undefined, statusColour?: string, statusTooltip?: string) => {
  const avatar = devModeEnabled ? <DevIcon /> : <Avatar />;
  if (!statusColour) {
    return avatar;
  }
  const badged = (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      badgeContent={
        <Box
          sx={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            backgroundColor: statusColour,
            border: "2px solid",
            borderColor: "background.paper",
          }}
        />
      }
    >
      {avatar}
    </Badge>
  );
  return statusTooltip ? <Tooltip title={statusTooltip}>{badged}</Tooltip> : badged;
};
