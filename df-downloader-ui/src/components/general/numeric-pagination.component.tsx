import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { Box, IconButton, Typography } from "@mui/material";
import { monoFontFamily } from "../../themes/build-theme";

export type NumericPaginationProps = {
  currentPage: number;
  numPages: number;
  onUpdatePage: (page: number) => void;
};

/**
 * Page numbers with ellipses, always showing first, last, current and its
 * neighbours. Replaces a full-width AppBar holding "Previous Page" and
 * "Next Page", which cost a whole bar of vertical space to move one page at a
 * time - unhelpful when the archive runs to 31 pages.
 */
const buildPageList = (current: number, total: number): (number | "gap")[] => {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((page, i) => {
    if (i > 0 && page - (sorted[i - 1] as number) > 1) {
      out.push("gap");
    }
    out.push(page);
  });
  return out;
};

export const NumericPagination = ({ currentPage, numPages, onUpdatePage }: NumericPaginationProps) => {
  if (numPages <= 1) {
    return null;
  }
  const pages = buildPageList(currentPage, numPages);
  return (
    // grid, not flex+justifyContent:center: the page-number cluster's own
    // width varies with how many are shown ("1 2 3 4 5" vs "1 … 15 … 31"),
    // which under a single centered flex row drags the arrows around with it
    // - clicking "next" repeatedly meant re-finding it each time rather than
    // clicking the same spot. Fixed outer columns pin the arrows in place;
    // the middle column centers the cluster independently within whatever
    // space is left. Capped maxWidth (rather than the full row) keeps the
    // arrows from splitting off to the far edges of a wide desktop window,
    // where the number cluster is narrow but the row itself isn't.
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: 1,
        maxWidth: 420,
        marginX: "auto",
        paddingY: 0.75,
      }}
    >
      <IconButton
        disabled={currentPage === 1}
        onClick={() => onUpdatePage(currentPage - 1)}
        sx={{
          justifySelf: "start",
          // Explicit padding rather than size="small"/"medium": small pairs
          // its default padding with a 20px icon (too subtle to be an
          // obvious button), medium pairs 8px padding with a 24px icon and
          // grows the whole bar noticeably taller than it needs to be. This
          // keeps the same 24px icon but tightens the padding around it.
          padding: 0.75,
          border: "1px solid",
          borderColor: "divider",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <ChevronLeftIcon />
      </IconButton>
      <Box sx={{ display: "flex", justifyContent: "center", gap: 0.25 }}>
        {pages.map((page, i) =>
          page === "gap" ? (
            <Typography key={`gap-${i}`} sx={{ paddingX: 0.5, color: "text.disabled", fontFamily: monoFontFamily }}>
              …
            </Typography>
          ) : (
            <Box
              key={page}
              component="button"
              onClick={() => onUpdatePage(page)}
              aria-current={page === currentPage ? "page" : undefined}
              sx={{
                minWidth: 28,
                height: 28,
                paddingX: 0.75,
                borderRadius: 1,
                cursor: "pointer",
                fontFamily: monoFontFamily,
                fontSize: "0.75rem",
                border: "1px solid",
                borderColor: page === currentPage ? "primary.main" : "transparent",
                backgroundColor: "transparent",
                color: page === currentPage ? "primary.main" : "text.secondary",
                fontWeight: page === currentPage ? 700 : 400,
                "&:hover": { backgroundColor: "action.hover", color: "text.primary" },
              }}
            >
              {page}
            </Box>
          )
        )}
      </Box>
      <IconButton
        disabled={currentPage === numPages}
        onClick={() => onUpdatePage(currentPage + 1)}
        sx={{
          justifySelf: "end",
          padding: 0.75,
          border: "1px solid",
          borderColor: "divider",
          "&:hover": { borderColor: "primary.main" },
        }}
      >
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
};
