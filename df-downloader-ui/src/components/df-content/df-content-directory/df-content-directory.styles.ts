import { ListItem, styled } from "@mui/material";

export const ContentDirectoryListItem = styled(ListItem)(({ theme }) => ({
  display: "flex",
  justifyContent: "center",
  [theme.breakpoints.down("md")]: {
    padding: "8px 2px",
  },
}));
