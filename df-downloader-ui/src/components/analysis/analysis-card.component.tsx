import { Box, Paper } from "@mui/material";
import { ReactNode } from "react";

/**
 * One item in an analysis list.
 *
 * These pages are lists of separate things - a game, a review, a piece of
 * hardware - and read as one continuous document without a strong enough
 * break between them. An outlined box alone is not enough: stacked outlines
 * of the same weight, a card's worth of text apart, look like sections of one
 * item rather than a list of many.
 *
 * The cue that does the work is the header band. A filled strip at the top of
 * each card gives every item an unmistakable starting edge while scrolling,
 * which a hairline border between two dark surfaces does not. The gap between
 * cards is deliberately larger than the padding inside them, so proximity
 * groups each card's own content rather than pulling neighbours together.
 */
export const AnalysisCard = ({ header, children }: { header: ReactNode; children?: ReactNode }) => (
  <Paper
    variant="outlined"
    sx={{
      overflow: "hidden",
      borderRadius: 1.5,
      // Lifts the card off the page background so the edge reads even where
      // the border falls between two similar darks.
      backgroundColor: "background.paper",
    }}
  >
    <Box
      sx={{
        px: 1.5,
        py: 1,
        backgroundColor: "background.default",
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      {header}
    </Box>
    {children != null && <Box sx={{ px: 1.5, py: 1.25 }}>{children}</Box>}
  </Paper>
);

/** The gap between cards - wider than any padding inside one, on purpose. */
export const ANALYSIS_CARD_GAP = 2;
