import PasswordIcon from "@mui/icons-material/Password";
import LogoutIcon from "@mui/icons-material/Logout";
import { Avatar, Badge, Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { logout } from "../../store/auth-user/auth-user.actions";
import { selectAuthUser } from "../../store/auth-user/auth-user.selector";
import { store } from "../../store/store";
import { ChangePasswordFormDialog } from "./change-password-dialog.component";

export type AuthUserInfoProps = {
  mode: "full" | "minimal";
  /**
   * Optional dot on the avatar. Only the collapsed nav rail passes this: it is
   * the sole carrier of the Digital Foundry connection state once the status
   * strip that normally shows it is gone. Passing it while the strip is
   * visible would just say the same thing twice.
   */
  statusColour?: string;
  statusTooltip?: string;
  /** Mirrors the strip's "we don't know yet" treatment - outline, no fill. */
  statusHollow?: boolean;
  /** Rendered above the menu items - the collapsed rail puts the version here. */
  menuHeader?: React.ReactNode;
};
export const AuthUserInfo = ({ mode, statusColour, statusTooltip, statusHollow, menuHeader }: AuthUserInfoProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
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
      {mode === "full" && (
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.3 }}>{user.id}</Typography>
      )}
      <IconButton onClick={handleClick} sx={{ padding: 0.5 }}>
        {renderAvatar(user.id, statusColour, statusTooltip, statusHollow)}
      </IconButton>
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

/**
 * The initial, not MUI's default silhouette - at this size the silhouette
 * reads as a generic shape rather than as "you". Deliberately the quietest
 * thing in the rail: no accent colour, no border, secondary text.
 */
const renderAvatar = (userId: string, statusColour?: string, statusTooltip?: string, statusHollow?: boolean) => {
  const avatar = (
    <Avatar
      sx={{
        width: 28,
        height: 28,
        fontSize: "0.75rem",
        fontWeight: 500,
        color: "text.secondary",
        backgroundColor: "action.selected",
      }}
    >
      {userId.trim().charAt(0).toUpperCase()}
    </Avatar>
  );
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
            backgroundColor: statusHollow ? "background.paper" : statusColour,
            border: "2px solid",
            borderColor: statusHollow ? statusColour : "background.paper",
          }}
        />
      }
    >
      {avatar}
    </Badge>
  );
  return statusTooltip ? <Tooltip title={statusTooltip}>{badged}</Tooltip> : badged;
};
