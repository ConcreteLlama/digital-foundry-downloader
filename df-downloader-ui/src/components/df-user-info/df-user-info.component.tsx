import { Avatar, Box, Typography } from "@mui/material";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { store } from "../../store/store";
import { queryDfUserInfo } from "../../store/df-user/df-user.actions";
import { selectDfUserInfo } from "../../store/df-user/df-user.selector";

export type DfUserInfoProps = {
  mode: "full" | "minimal";
};
export const DfUserInfo = ({ mode }: DfUserInfoProps) => {
  useEffect(() => {
    store.dispatch(queryDfUserInfo.start());
  }, []);
  const userInfo = useSelector(selectDfUserInfo);
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
