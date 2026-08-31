import { Alert, Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import { AiCostLedgerResponse } from "df-downloader-common";
import { useEffect, useState } from "react";
import { fetchAiCosts } from "../../api/ai-analysis.ts";
import { conciseFormatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

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
          <Box>
            <Typography sx={{ ...numberSx, fontSize: "1.75rem", lineHeight: 1.1 }}>
              {formatTotal(ledger.totalCostUsd)}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              across {ledger.runCount} analysed {ledger.runCount === 1 ? "item" : "items"}
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
        {/* Said plainly rather than left for someone to discover by adding
            the rows up against a bill that does not match. */}
        <Typography variant="caption" sx={{ display: "block", marginTop: 1.5, color: "text.disabled" }}>
          Re-analysing an item replaces its stored result, so this counts the analyses you hold now rather than
          everything ever spent.
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
              sx={{ alignItems: "baseline", paddingY: 1 }}
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
                {formatCost(entry.costUsd)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};
