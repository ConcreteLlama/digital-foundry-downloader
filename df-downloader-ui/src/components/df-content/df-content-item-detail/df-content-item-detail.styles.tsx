import { Paper, styled } from "@mui/material";

export const ContentItemDetailContainer = styled(Paper)(({ theme }) => ({
  padding: "5vh",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  [theme.breakpoints.down("md")]: {
    padding: "2vh",
  },
  [theme.breakpoints.down("sm")]: {
    padding: "1vh",
  },
}));
