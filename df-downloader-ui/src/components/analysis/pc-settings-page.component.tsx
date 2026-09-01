import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { PcSettingsIndexResponse, PcSettingsRow } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchPcSettingsIndex } from "../../api/ai-analysis.ts";
import { ANALYSIS_CARD_GAP, AnalysisCard } from "./analysis-card.component.tsx";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { conciseFormatDate } from "../../utils/date.ts";

/**
 * Every PC review's optimised settings, in one place.
 *
 * The data was already being extracted per video and could only be read one
 * item at a time, so "which of my games have recommended settings, and what
 * did they say about shadows" had no answer despite the answer sitting on
 * disk. This is a join over what was already stored, not new work.
 *
 * Nothing is averaged across games, and the page says why where it matters: a
 * setting's cost comes from one scene on one machine at one resolution, so a
 * mean over several reviews would be a number describing nothing. Counts are
 * fine - how often DF returns to a setting is a fact about their coverage.
 */

const numberSx = { fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" } as const;

/** A stated cost, or an explicit blank - never a zero standing in for "unknown". */
const CostCell = ({ pct }: { pct?: number | null }) =>
  pct == null ? (
    <Typography variant="caption" sx={{ color: "text.disabled", fontStyle: "italic" }}>
      not stated
    </Typography>
  ) : (
    <Typography variant="body2" sx={{ ...numberSx, color: pct >= 10 ? "warning.main" : "text.primary" }}>
      {pct > 0 ? "-" : ""}
      {Math.abs(pct)}%
    </Typography>
  );

const ReviewCard = ({ row }: { row: PcSettingsRow }) => (
  <AnalysisCard
    header={
      <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 600, color: "primary.main" }}>{row.game || row.title}</Typography>
        {row.engine && (
          <Chip
            size="small"
            variant="outlined"
            label={row.engine}
            sx={{ height: 20, fontSize: "0.65rem", color: "secondary.main", borderColor: "secondary.main" }}
          />
        )}
        <Box sx={{ flex: "1 1 auto" }} />
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          {conciseFormatDate(row.publishedDate)}
        </Typography>
      </Stack>
    }
  >

    {row.verdict && (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {row.verdict}
      </Typography>
    )}

    {row.bottleneck && (
      <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mt: 0.5 }}>
        Bottleneck: {row.bottleneck}
      </Typography>
    )}

    {row.optimised && (row.optimised.fpsBefore != null || row.optimised.fpsAfter != null) && (
      <Box sx={{ mt: 1, p: 1, borderRadius: 1, bgcolor: "background.default" }}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Optimised settings
          {row.optimised.testSystem ? ` on ${row.optimised.testSystem}` : ""}:{" "}
          <Box component="span" sx={numberSx}>
            {row.optimised.fpsBefore ?? "?"} → {row.optimised.fpsAfter ?? "?"} fps
          </Box>
          {row.optimised.gainPct != null && (
            <Box component="span" sx={{ ...numberSx, color: "success.main", ml: 0.75 }}>
              +{row.optimised.gainPct}%
            </Box>
          )}
        </Typography>
      </Box>
    )}

    {row.settings.length > 0 && (
      <Box sx={{ mt: 1, overflowX: "auto" }}>
        <Box
          component="table"
          sx={{
            width: "100%",
            borderCollapse: "collapse",
            "& td, & th": { textAlign: "left", py: 0.5, pr: 1.5, verticalAlign: "top" },
            "& th": { fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "text.disabled" },
            "& tr + tr td": { borderTop: 1, borderColor: "divider" },
          }}
        >
          <thead>
            <tr>
              <th>Setting</th>
              <th>Cost</th>
              <th>Recommended</th>
            </tr>
          </thead>
          <tbody>
            {row.settings.map((setting, index) => (
              <tr key={`${setting.name}-${index}`}>
                <td>
                  <Typography variant="body2">{setting.name}</Typography>
                  {setting.consoleEquivalent && (
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>
                      console: {setting.consoleEquivalent}
                    </Typography>
                  )}
                </td>
                <td>
                  <CostCell pct={setting.perfDeltaPct} />
                </td>
                <td>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {setting.recommendation || "—"}
                  </Typography>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>
    )}
  </AnalysisCard>
);

export const PcSettingsPage = () => {
  const [data, setData] = useState<PcSettingsIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPcSettingsIndex()
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
    const term = search.trim().toLowerCase();
    if (!term) {
      return data.rows;
    }
    // Matches the setting names too, which is the point of the page: "which
    // games did they talk about ray tracing in" is the question being asked.
    return data.rows.filter(
      (row) =>
        (row.game ?? row.title).toLowerCase().includes(term) ||
        row.settings.some((setting) => setting.name.toLowerCase().includes(term))
    );
  }, [data, search]);

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Building the settings index…
        </Typography>
      </Stack>
    );
  }

  if (failed || !data) {
    return <Alert severity="error">Could not read the settings index.</Alert>;
  }

  const statedPct =
    data.coverage.totalSettings > 0
      ? Math.round((data.coverage.withStatedCost / data.coverage.totalSettings) * 100)
      : 0;

  return (
    <Stack spacing={2} sx={{ py: 1 }}>
      <Box>
        <Typography variant="h6" sx={{ color: "primary.main" }}>
          PC settings
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Recommended settings from every analysed PC review · {data.reviewCount}{" "}
          {data.reviewCount === 1 ? "review" : "reviews"} from {data.analysedCount} analysed items
        </Typography>
      </Box>

      {data.reviewCount === 0 ? (
        <Alert severity="info">
          Nothing here yet. This fills in as PC reviews are analysed — anything with an optimised settings
          section appears automatically.
        </Alert>
      ) : (
        <>
          {data.commonSettings.length > 0 && (
            <Box>
              <Typography variant="overline" sx={{ color: "text.disabled" }}>
                Most discussed
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                {data.commonSettings.slice(0, 12).map((setting) => (
                  <Chip
                    key={setting.name}
                    size="small"
                    variant={search.toLowerCase() === setting.name.toLowerCase() ? "filled" : "outlined"}
                    label={`${setting.name} · ${setting.gameCount}`}
                    onClick={() =>
                      setSearch((current) =>
                        current.toLowerCase() === setting.name.toLowerCase() ? "" : setting.name
                      )
                    }
                    sx={{ height: 22, fontSize: "0.7rem" }}
                  />
                ))}
              </Stack>
            </Box>
          )}

          <TextField
            size="small"
            label="Search games or settings"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ maxWidth: 420 }}
          />

          {/* Said plainly, because a column of "not stated" otherwise reads as
              a bug rather than as how this content is actually written. */}
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {statedPct}% of settings had a performance cost stated as a number. The rest were described only
            in words, and are left blank rather than estimated. Costs are never averaged across games — each
            is one scene on one machine.
          </Typography>

          <Divider />

          {rows.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              Nothing matches “{search}”.
            </Typography>
          ) : (
            <Stack spacing={ANALYSIS_CARD_GAP}>
              {rows.map((row) => (
                <ReviewCard key={row.contentKey} row={row} />
              ))}
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
};
