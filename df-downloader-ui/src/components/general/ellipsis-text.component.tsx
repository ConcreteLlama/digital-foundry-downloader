import { Typography, styled } from "@mui/material";

export const EllipsisText = styled(Typography)({
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
