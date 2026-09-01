import { Alert, Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import { AiCostLedgerResponse, formatDurationMs } from "df-downloader-common";
import { useEffect, useState } from "react";
import { fetchAiCosts } from "../../api/ai-analysis.ts";
import { conciseFormatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { useAnalysisDrilldown } from "./use-analysis-drilldown.tsx";

/**
 * What the analyses you currently hold cost to produce.
 *
 * Cost is recorded on every run and already shown on each analysis, but only
 * ever one at a time - so "how much has this cost me" had no answer short of
 * opening every video in turn. This is that answer, read from the figures the
 * runs recorded rather than tracked separately, so nothing here can drift
 * from what was actually charged.
 *
 * It is not a record of everything ever spent, and says so rather than
 * implying otherwise: a result is one blob per item, so re-analysing replaces
 * it and takes the earlier run's cost with it. A true lifetime total needs
 * spend written somewhere a re-run does not overwrite.
 */

/** Two decimals is the bill; sub-cent runs are common enough to need the floor. */
const formatCost = (costUsd: number) => (costUsd > 0 && costUsd < 0.01 ? "<$0.01" : `$${costUsd.toFixed(2)}`);

/** Full precision, for the total - where a fraction of a cent per run adds up. */
const formatTotal = (costUsd: number) => `$${costUsd.toFixed(costUsd < 1 ? 3 : 2)}`;

const numberSx = { fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" } as const;

export const CostsPage = () => {
  const [ledger, setLedger] = useState<AiCostLedgerResponse | null>(null);
  const { openAnalysis, dialogs } = useAnalysisDrilldown("costs");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAiCosts()
      .then((result) => !cancelled && setLedger(result))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Loading costs…
        </Typography>
      </Stack>
    );
  }

  if (failed || !ledger) {
    return <Alert severity="error">Could not read what analysis has cost.</Alert>;
  }

  if (!ledger.runCount) {
    return (
      <Alert severity="info">
        Nothing analysed yet, so nothing spent.
        {ledger.runsWithoutCost > 0 &&
          ` ${ledger.runsWithoutCost} stored ${
            ledger.runsWithoutCost === 1 ? "analysis records" : "analyses record"
          } no cost.`}
      </Alert>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="h5">Costs</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          What the analyses you currently hold cost to produce, taken from what each run recorded.
        </Typography>
      </Box>

      <Paper sx={{ padding: 2 }}>
        <Stack direction="row" spacing={3} sx={{ alignItems: "baseline", flexWrap: "wrap" }} useFlexGap>
          {/* Leads, because it is the question people actually mean. The
              figure beside it answers a different one and says so. */}
          <Box>
            <Typography sx={{ ...numberSx, fontSize: "1.75rem", lineHeight: 1.1 }}>
              {formatTotal(ledger.lifetimeCostUsd)}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", color: "text.disabled" }}>
              spent across {ledger.lifetimeRunCount} {ledger.lifetimeRunCount === 1 ? "run" : "runs"}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ ...numberSx, fontSize: "1.25rem", lineHeight: 1.1, color: "text.secondary" }}>
              {formatTotal(ledger.totalCostUsd)}
            </Typography>
            <Typography variant="caption" sx={{ display: "block", color: "text.disabled" }}>
              to produce the {ledger.runCount} {ledger.runCount === 1 ? "analysis" : "analyses"} you hold
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
            {ledger.byModel.map((row) => (
              <Chip
                key={row.model}
                size="small"
                variant="outlined"
                label={`${row.model} · ${row.runCount} · ${formatCost(row.costUsd)}`}
                sx={{ fontFamily: monoFontFamily, fontSize: "0.7rem" }}
              />
            ))}
          </Stack>
        </Stack>
        {/* Both figures explained, since two totals with different values is
            otherwise the sort of thing that reads as a bug. */}
        <Typography variant="caption" sx={{ display: "block", marginTop: 1.5, color: "text.disabled" }}>
          The two differ because re-analysing an item replaces its stored result: the run was charged for, and the
          result it produced is gone. Spend is recorded from{" "}
          {ledger.lifetimeFrom ? conciseFormatDate(ledger.lifetimeFrom) : "when this log began"} - anything analysed
          before that counts in the figure on the right but not the one on the left.
        </Typography>
        {ledger.runsWithoutCost > 0 && (
          <Typography variant="caption" sx={{ display: "block", marginTop: 1.5, color: "text.disabled" }}>
            {ledger.runsWithoutCost} stored {ledger.runsWithoutCost === 1 ? "analysis" : "analyses"} recorded no usage
            and {ledger.runsWithoutCost === 1 ? "is" : "are"} not counted above - not the same as having cost nothing.
          </Typography>
        )}
      </Paper>

      <Paper sx={{ padding: 2 }}>
        <Stack divider={<Divider />}>
          {ledger.entries.map((entry, index) => (
            <Stack
              key={`${entry.contentKey}-${entry.analysedAt.toISOString()}-${index}`}
              direction="row"
              spacing={2}
              /*
               * The whole row, unlike the card pages where only the title is
               * the control: this row is a compact ledger line with nothing
               * inside it to read closely or select, so the larger target is
               * the better one.
               */
              role="button"
              tabIndex={0}
              onClick={() => openAnalysis(entry.contentKey, entry.title)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openAnalysis(entry.contentKey, entry.title);
                }
              }}
              sx={{
                alignItems: "baseline",
                paddingY: 1,
                paddingX: 1,
                marginX: -1,
                cursor: "pointer",
                borderRadius: 1,
                "&:hover": { backgroundColor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
              }}
            >
              <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
                <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                  {entry.title}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.disabled", ...numberSx }}>
                  {entry.model} · {conciseFormatDate(entry.analysedAt)} ·{" "}
                  {entry.inputTokens.toLocaleString()} in · {entry.outputTokens.toLocaleString()} out
                  {entry.hasError && " · failed"}
                </Typography>
              </Box>
              <Typography
                sx={{
                  ...numberSx,
                  flexShrink: 0,
                  // A failed run still spent tokens getting there, so it is
                  // charged - shown muted rather than hidden.
                  color: entry.hasError ? "text.disabled" : "text.primary",
                }}
              >
                {/* Time, for a run that cost that instead of money. Never
                    rendered as a price of zero, which would read as free. */}
                {entry.costUsd !== undefined
                  ? formatCost(entry.costUsd)
                  : entry.durationMs !== undefined
                    ? formatDurationMs(entry.durationMs)
                    : "-"}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>

      {dialogs}
    </Box>
  );
};
