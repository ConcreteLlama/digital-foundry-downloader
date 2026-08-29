import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  BulkBackfillCandidate,
  BulkBackfillEstimate,
  BulkBackfillTarget,
  BulkBackfillTargetLabels,
} from "df-downloader-common";
import { useCallback, useEffect, useMemo, useState } from "react";
import { estimateBackfill, fetchBackfillCandidates, runBackfill } from "../../../api/backfill.ts";
import { BackfillConfirmDialog, BackfillTable, isApplicable } from "./bulk-backfill.components.tsx";

/**
 * Bulk backfill: apply subtitles, AI analysis or article matching across
 * many items at once.
 *
 * All three targets share this one page rather than getting their own,
 * because they are the same interaction - pick a set of items, apply an
 * action - differing only in which items are eligible and what "already
 * done" means. Three pages would have been three copies of the selection,
 * confirmation and progress handling with a different predicate in each.
 */

const TARGET_DESCRIPTIONS: Record<BulkBackfillTarget, string> = {
  subtitles:
    "Transcribe downloaded videos that do not have subtitles yet. This runs on this machine, one at a time, and a long video can take a while.",
  ai_analysis:
    "Write a summary, verdict, structured data and tags for downloaded videos. This calls the Claude API and costs a small amount per video.",
  df_article:
    "Find Digital Foundry's own written article for each video. Costs nothing but time, and gives later analyses a better source to work from than the transcript alone.",
};

const FORCE_LABELS: Record<BulkBackfillTarget, string> = {
  subtitles: "Re-transcribe items that already have subtitles",
  ai_analysis: "Re-analyse items that have already been analysed",
  df_article: "Search again for items that already have a matched article",
};

export const BulkBackfillPage = () => {
  const [target, setTarget] = useState<BulkBackfillTarget>("subtitles");
  const [force, setForce] = useState(false);
  const [candidates, setCandidates] = useState<BulkBackfillCandidate[]>([]);
  const [libraryCount, setLibraryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [estimate, setEstimate] = useState<BulkBackfillEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const [started, setStarted] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchBackfillCandidates(target);
      setCandidates(response.candidates);
      setLibraryCount(response.libraryCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the content list");
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    // Switching target changes both the eligible set and what "already
    // done" means, so a selection made against the previous target would
    // carry over as a set of keys the new one may not even offer.
    setSelected(new Set());
    setStarted(null);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    if (!needle) {
      return candidates;
    }
    return candidates.filter((candidate) => candidate.title.toLowerCase().includes(needle));
  }, [candidates, filterText]);

  const applicable = useMemo(
    () => filtered.filter((candidate) => isApplicable(candidate, target, force)),
    [filtered, target, force]
  );

  const toggle = (contentKey: string, isSelected: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(contentKey);
      } else {
        next.delete(contentKey);
      }
      return next;
    });

  const openConfirm = async () => {
    setConfirmOpen(true);
    setEstimate(null);
    setEstimating(true);
    try {
      setEstimate(await estimateBackfill(target, [...selected], force));
    } catch {
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  };

  const confirm = async () => {
    setConfirmOpen(false);
    try {
      const response = await runBackfill(target, [...selected], force);
      setStarted(
        `Started on ${response.queued} ${response.queued === 1 ? "item" : "items"}` +
          (response.skipped ? `, skipped ${response.skipped} that could not take this action` : "")
      );
      setSelected(new Set());
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the run");
    }
  };

  return (
    <Stack sx={{ gap: 1.5, height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Backfill
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Apply subtitles, analysis or article matching to content you already have.
        </Typography>
      </Box>

      <ToggleButtonGroup
        size="small"
        exclusive
        value={target}
        onChange={(_event, value) => value && setTarget(value)}
      >
        {BulkBackfillTarget.options.map((option) => (
          <ToggleButton key={option} value={option}>
            {BulkBackfillTargetLabels[option]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {TARGET_DESCRIPTIONS[target]}
      </Typography>

      <FormControlLabel
        control={<Switch size="small" checked={force} onChange={(event) => setForce(event.target.checked)} />}
        label={<Typography variant="body2">{FORCE_LABELS[target]}</Typography>}
      />

      {error && (
        <Alert severity="error" variant="outlined" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {started && (
        <Alert severity="success" variant="outlined" onClose={() => setStarted(null)}>
          {started} · follow it on the Activity page.
        </Alert>
      )}

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Loading content…
          </Typography>
        </Stack>
      ) : candidates.length === 0 ? (
        <Alert severity="info" variant="outlined">
          {target === "df_article"
            ? "No content with a linked YouTube video, so there is nothing an article could be matched against."
            : "Nothing downloaded yet, so there is nothing to work on."}
        </Alert>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Filter"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              sx={{ maxWidth: 260, flex: "1 1 180px" }}
            />
            <Button
              size="small"
              variant="outlined"
              disabled={applicable.length === 0}
              onClick={() => setSelected(new Set(applicable.map((candidate) => candidate.contentKey)))}
            >
              Select all that need it ({applicable.length})
            </Button>
            <Button
              size="small"
              onClick={() => setSelected(new Set(filtered.map((candidate) => candidate.contentKey)))}
            >
              Select all ({filtered.length})
            </Button>
            <Button size="small" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </Stack>

          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {candidates.length} of {libraryCount.toLocaleString()} items can take this action
            {filtered.length !== candidates.length && ` · ${filtered.length} match the filter`}
          </Typography>

          <Box sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
            <BackfillTable candidates={filtered} target={target} selected={selected} onToggle={toggle} />
          </Box>

          <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: "0 0 auto" }}>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              {selected.size} selected
            </Typography>
            <Button variant="contained" disabled={selected.size === 0} onClick={openConfirm}>
              Run
            </Button>
          </Stack>
        </>
      )}

      <BackfillConfirmDialog
        open={confirmOpen}
        target={target}
        count={selected.size}
        force={force}
        estimate={estimate}
        estimating={estimating}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirm}
      />
    </Stack>
  );
};
