import { Avatar, Box, Button, IconButton, Menu, Stack, Typography } from "@mui/material";
import { Fragment, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { store } from "../../store/store";
import { queryDfUserInfo } from "../../store/df-user/df-user.actions";
import { selectDfUserInfo } from "../../store/df-user/df-user.selector";
import { Link } from "react-router-dom";

export type DfUserInfoProps = {
  mode: "full" | "minimal";
};
export const DfUserInfo = ({ mode }: DfUserInfoProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };
  useEffect(() => {
    store.dispatch(queryDfUserInfo.start());
  }, []);
  const userInfo = useSelector(selectDfUserInfo);
  return (
    <Fragment>
      {userInfo ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {mode === "full" && <Typography>{userInfo.username}</Typography>}
          <IconButton onClick={handleClick}>
            <Avatar src={userInfo.avatarUrl} />
          </IconButton>
        </Box>
      ) : (
        <Typography>Not signed in</Typography>
      )}
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          "aria-labelledby": "basic-button",
        }}
      >
        {userInfo ? (
          <Stack sx={{ padding: 2, gap: 2 }}>
            <Typography>Username: {userInfo.username}</Typography>
            <Typography>Tier: {userInfo.tier || "Unknown"}</Typography>
          </Stack>
        ) : (
          <Stack sx={{ padding: 2, gap: 2 }}>
            <Typography>Not signed in to DF</Typography>
            <Button component={Link} to="/settings/df">
              Click here to sign in
            </Button>
          </Stack>
        )}
      </Menu>
    </Fragment>
  );
};
