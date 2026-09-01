import { Alert, Box, Chip, CircularProgress, Divider, Stack, Typography } from "@mui/material";
import { HardwareIndexResponse, HardwareRow } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchHardwareIndex } from "../../api/ai-analysis.ts";
import { ANALYSIS_CARD_GAP, AnalysisCard } from "./analysis-card.component.tsx";
import { conciseFormatDate } from "../../utils/date.ts";

/**
 * Every analysed hardware review.
 *
 * Around 8% of a real library is hardware - cards, CPUs, handhelds, displays
 * - and all of it used to classify as "other" and appear in no view at all,
 * so "what did they conclude about the 9070 GRE" had no answer here even when
 * the review was downloaded and analysed.
 *
 * Reviews are listed rather than merged into a per-product catalogue: DF
 * revisit hardware as drivers and prices move, so two reviews of one card are
 * two verdicts at two moments, and collapsing them would silently pick one.
 */

const ReviewCard = ({ row }: { row: HardwareRow }) => (
  <AnalysisCard
    accent="secondary.main"
    header={
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 600, color: "secondary.main" }}>{row.title}</Typography>
        <Box sx={{ flex: "1 1 auto" }} />
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          {conciseFormatDate(row.publishedDate)}
        </Typography>
      </Stack>
    }
  >

    {row.products.length > 0 && (
      <Stack spacing={0.75}>
        {row.products.map((product, index) => (
          <Box key={`${product.name}-${index}`}>
            <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {product.name}
              </Typography>
              {product.productClass && (
                <Chip
                  size="small"
                  variant="outlined"
                  label={product.productClass}
                  sx={{ height: 18, fontSize: "0.62rem", color: "secondary.main", borderColor: "secondary.main" }}
                />
              )}
            </Stack>
            {product.verdict && (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {product.verdict}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    )}

    {row.verdict && (
      <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider", borderTopStyle: "dashed" }}>
        <Typography variant="body2">{row.verdict}</Typography>
      </Box>
    )}

    {row.knownIssues.length > 0 && (
      <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, color: "text.secondary" }}>
        {row.knownIssues.map((issue, index) => (
          <Typography component="li" variant="body2" key={index}>
            {issue}
          </Typography>
        ))}
      </Box>
    )}

    {/* Labelled as tests, never as coverage - these games are instruments in
        a hardware review, and listing them plainly would imply the archive
        holds coverage of them that it does not. */}
    {row.gamesTested.length > 0 && (
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          Tested with
        </Typography>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {row.gamesTested.map((game) => (
            <Chip key={game} size="small" variant="outlined" label={game} sx={{ height: 20, fontSize: "0.65rem" }} />
          ))}
        </Stack>
      </Box>
    )}
  </AnalysisCard>
);

export const HardwarePage = () => {
  const [data, setData] = useState<HardwareIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [productClass, setProductClass] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHardwareIndex()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    if (!data) {
      return [];
    }
    if (!productClass) {
      return data.rows;
    }
    return data.rows.filter((row) =>
      row.products.some((product) => product.productClass?.trim() === productClass)
    );
  }, [data, productClass]);

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Loading hardware reviews…
        </Typography>
      </Stack>
    );
  }

  if (failed || !data) {
    return <Alert severity="error">Could not read the hardware index.</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <Box>
        <Typography variant="h6" sx={{ color: "secondary.main" }}>
          Hardware
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Graphics cards, CPUs, handhelds and displays · {data.reviewCount}{" "}
          {data.reviewCount === 1 ? "review" : "reviews"} from {data.analysedCount} analysed items
        </Typography>
      </Box>

      {data.reviewCount === 0 ? (
        /*
         * Deliberately explains itself. Hardware reviews were only recognised
         * as their own kind of content recently, so an existing library will
         * have plenty of them analysed as "other" - and an empty page with no
         * explanation reads as broken rather than as out of date.
         */
        <Alert severity="info">
          No hardware reviews yet. Hardware is only recognised as its own kind of content in recent
          analyses, so anything analysed before that is still filed as “Other”. Re-analysing those from
          Tools → Backfill will fill this in — note that re-analysing is charged for again.
        </Alert>
      ) : (
        <>
          {data.classesPresent.length > 1 && (
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                label="All"
                variant={productClass ? "outlined" : "filled"}
                onClick={() => setProductClass(null)}
                sx={{ height: 22, fontSize: "0.7rem" }}
              />
              {data.classesPresent.map((label) => (
                <Chip
                  key={label}
                  size="small"
                  label={label}
                  variant={productClass === label ? "filled" : "outlined"}
                  onClick={() => setProductClass((current) => (current === label ? null : label))}
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              ))}
            </Stack>
          )}

          <Divider />

          <Stack spacing={ANALYSIS_CARD_GAP}>
            {rows.map((row) => (
              <ReviewCard key={row.contentKey} row={row} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
};
