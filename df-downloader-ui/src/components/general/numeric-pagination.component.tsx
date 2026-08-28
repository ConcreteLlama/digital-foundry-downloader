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
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.25, paddingY: 1 }}>
      <IconButton size="small" disabled={currentPage === 1} onClick={() => onUpdatePage(currentPage - 1)}>
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
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
      <IconButton size="small" disabled={currentPage === numPages} onClick={() => onUpdatePage(currentPage + 1)}>
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};
