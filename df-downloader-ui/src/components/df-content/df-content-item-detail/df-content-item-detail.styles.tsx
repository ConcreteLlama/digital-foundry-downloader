import { Paper, styled } from "@mui/material";

/**
 * Padding is fixed, not viewport-relative.
 *
 * This was 5vh on all four sides, which meant the dialog's margins grew with
 * the height of the display - ~39px on a 787px-tall foldable, ~72px on a 1440p
 * monitor - so the bigger the screen, the more of it went to empty edges. The
 * top is tighter than the rest because the first thing in the panel is its
 * header: title, layout toggle and close. Chrome that sits a thumb's width
 * below the top edge reads as floating rather than as a header.
 */
export const ContentItemDetailContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  paddingTop: theme.spacing(2),
  display: "flex",
  flexDirection: "column",
  gap: 2,
  // Nothing in here may push the modal sideways - long file paths and wide
  // tables used to do exactly that.
  maxWidth: "100%",
  overflowX: "hidden",
  /*
    A definite width, not one derived from the content.
    
    The modal shrink-wraps whatever it is given, so without this the panel
    was as wide as whichever tab happened to be open - and the tabs differ a
    lot, so switching between them resized the dialog under the cursor. The
    same complaint as the height, on the other axis: sized to the widest
    thing it has to hold, and then left alone.

    Capped against the viewport so it can still fit a small window, and only
    from sm up - below that the modal is deliberately full-bleed.
  */
  [theme.breakpoints.up("sm")]: {
    width: "min(1100px, 94vw)",
  },
  [theme.breakpoints.down("md")]: {
    padding: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
  },
  [theme.breakpoints.down("sm")]: {
    padding: theme.spacing(1.5),
    paddingTop: theme.spacing(1),
  },
}));
