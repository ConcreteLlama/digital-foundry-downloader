import { Paper, styled } from "@mui/material";

export const ContentItemDetailContainer = styled(Paper)(({ theme }) => ({
  padding: "5vh",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  // Nothing in here may push the modal sideways - long file paths and wide
  // tables used to do exactly that.
  maxWidth: "100%",
  overflowX: "hidden",
  [theme.breakpoints.down("md")]: {
    padding: "2vh",
  },
  [theme.breakpoints.down("sm")]: {
    padding: "1vh",
  },
}));
