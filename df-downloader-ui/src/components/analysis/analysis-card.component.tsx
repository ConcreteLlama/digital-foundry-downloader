import { Box, Paper, Typography, alpha } from "@mui/material";
import { ReactNode } from "react";

/**
 * One item in an analysis list.
 *
 * These pages are lists of separate things - a game, a review, a piece of
 * hardware - and read as one continuous document without a strong enough
 * break between them.
 *
 * The first attempt at this used a header band filled with `background.default`,
 * which is *darker* than the card surface it sits on (#07090c against #0d1116).
 * That reads as a recess rather than a header, and at that contrast it barely
 * reads at all - so the list still looked like one long item. Three cues do
 * the work instead, and they are cheap:
 *
 * - a left accent stripe, which is the strongest "new item starts here" signal
 *   available and the only one that survives being scrolled past quickly;
 * - a header band tinted with the accent rather than with a flat grey, so it
 *   is lighter than the surface and reads as a header;
 * - a gap between cards wider than any padding inside them, so proximity
 *   groups each card's own content instead of pulling neighbours together.
 *
 * The accent defaults to the palette's primary. Both accents it can be given
 * are the deliberately non-semantic ones - the state colours (ok/warn/err)
 * stay reserved for actually encoding state, so nothing here can be mistaken
 * for a warning.
 */
export const AnalysisCard = ({
  header,
  children,
  accent = "primary.main",
}: {
  header: ReactNode;
  children?: ReactNode;
  /** A non-semantic palette accent - "primary.main" or "secondary.main". */
  accent?: "primary.main" | "secondary.main";
}) => (
  <Paper
    variant="outlined"
    sx={(theme) => {
      const accentColor =
        accent === "secondary.main" ? theme.palette.secondary.main : theme.palette.primary.main;
      return {
        overflow: "hidden",
        borderRadius: 1.5,
        backgroundColor: "background.paper",
        borderLeft: `3px solid ${alpha(accentColor, 0.85)}`,
        "& > .analysis-card-header": {
          backgroundColor: alpha(accentColor, 0.09),
          borderBottom: `1px solid ${alpha(accentColor, 0.22)}`,
        },
      };
    }}
  >
    <Box className="analysis-card-header" sx={{ px: 1.5, py: 1 }}>
      {header}
    </Box>
    {children != null && <Box sx={{ px: 1.5, py: 1.25 }}>{children}</Box>}
  </Paper>
);

/** The gap between cards - wider than any padding inside one, on purpose. */
export const ANALYSIS_CARD_GAP = 2;

/**
 * A card's title, as the way into that item's full analysis.
 *
 * The title rather than the whole card: these cards hold tables meant to be
 * read and selected from, and a click anywhere navigating away would fight
 * that. Takes the card's own accent so it does not introduce a third colour
 * into a header built around one.
 */
export const AnalysisCardTitle = ({
  children,
  onOpen,
  accent = "primary.main",
}: {
  children: ReactNode;
  onOpen: () => void;
  accent?: "primary.main" | "secondary.main";
}) => (
  <Typography
    component="button"
    type="button"
    onClick={onOpen}
    sx={{
      fontWeight: 600,
      color: accent,
      font: "inherit",
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      textAlign: "left",
      "&:hover": { textDecoration: "underline" },
      "&:focus-visible": { outline: "2px solid", outlineColor: accent, outlineOffset: 2 },
    }}
  >
    {children}
  </Typography>
);
