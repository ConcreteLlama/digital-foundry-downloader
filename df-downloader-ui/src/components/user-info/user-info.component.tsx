import { Avatar, Box, Typography } from "@mui/material";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { store } from "../../store/store";
import { queryUserInfo } from "../../store/user/user.actions";
import { selectUserInfo } from "../../store/user/user.selector";

export type UserInfoProps = {
  mode: "full" | "minimal";
};
export const UserInfo = ({ mode }: UserInfoProps) => {
  useEffect(() => {
    store.dispatch(queryUserInfo.start());
  }, []);
  const userInfo = useSelector(selectUserInfo);
  return userInfo ? (
    <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
      {mode === "full" && (
        <Typography>
          {userInfo.username} ({userInfo.tier})
        </Typography>
      )}
      <Avatar src={userInfo.avatarUrl} />
    </Box>
  ) : (
    <Typography>Not signed in</Typography>
  );
};
