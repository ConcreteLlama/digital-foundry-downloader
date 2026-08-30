import { Container, styled } from "@mui/material";

/**
 * Rendered with disableGutters - see MiddleModal.
 *
 * Container applies its own horizontal padding (24px from sm up, 16px
 * below) inside a media query, which beat this shorthand and left a band
 * of the page visible down both edges of every modal. The "padding: 0"
 * rule below looked like it made phones full-bleed and never did.
 */
export const ResponsiveModalContainer = styled(Container)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "1rem",
  padding: "1rem",
  [theme.breakpoints.down("md")]: {
    padding: "8px",
  },
  [theme.breakpoints.down("sm")]: {
    padding: "0",
    // Full-bleed on a phone: centred children shrink to their content,
    // which is what left the page showing at the edges.
    alignItems: "stretch",
  },
}));
