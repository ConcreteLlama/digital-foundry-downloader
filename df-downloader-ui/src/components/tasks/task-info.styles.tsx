import { Box, Card, styled } from "@mui/material";

export const TaskInfoCard = styled(Card)({
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: "8px",
  gap: "0.5rem",
  width: "100%",
});

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
