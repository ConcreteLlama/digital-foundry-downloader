import { Card, CardProps, styled } from "@mui/material";

export const HoverOverCard = styled(Card)<CardProps>(() => ({
  my: 0.2,
  ":hover": { boxShadow: 10, position: "relative", top: -3, left: -3 },
}));
