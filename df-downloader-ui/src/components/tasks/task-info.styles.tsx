import { Box, Card, styled } from "@mui/material";

/**
 * A live task.
 *
 * Tightened from 8px/0.5rem: a running job is a title, a track and a status
 * line, and at the old spacing five of them filled a screen. The card still
 * has to read as a card, so this is a trim rather than a squeeze.
 */
export const TaskInfoCard = styled(Card)({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: "5px 8px",
  gap: "0.3rem",
  width: "100%",
  // Anchors CardCornerControls. The card's children are a centred column, so
  // a control added as one would sit under the content in the middle.
  position: "relative",
});

/**
 * A control tucked into the corner of a full card.
 *
 * For the actions that belong to the card as a whole rather than to any row
 * in it - clearing a finished pipeline, in practice. Absolute so the existing
 * centred column is left exactly as it was.
 */
export const CardCornerControls = styled(Box)(({ theme }) => ({
  position: "absolute",
  top: theme.spacing(0.5),
  right: theme.spacing(0.5),
}));

/**
 * A finished pipeline, at one line. Twenty completed downloads as full cards
 * buried the two that were still running.
 */
export const CompletedTaskRow = styled(Box)(({ theme }) => ({
  display: "grid",
  // Fixed columns, not space-between: the format and status have to line up
  // down the list, and with a flexible title between them their position
  // otherwise moved with the length of each title.
  gridTemplateColumns: "auto minmax(0, 1fr) 7rem 6rem auto",
  alignItems: "center",
  gap: theme.spacing(1),
  width: "100%",
  padding: `${theme.spacing(0.5)} ${theme.spacing(1)}`,
  borderBottom: `1px solid ${theme.palette.divider}`,
  cursor: "pointer",
  "&:hover": { backgroundColor: theme.palette.action.hover },
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "auto minmax(0, 1fr) 5rem auto",
  },
}));
