import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import {
  BulkBackfillCandidate,
  BulkBackfillEstimate,
  BulkBackfillTarget,
  BulkBackfillTargetLabels,
} from "df-downloader-common";
import { memo } from "react";
import { ColumnInfo, GridCell, GridRow, GridTable, GridTextCell } from "../../general/grid-table.tsx";
import { conciseFormatDate } from "../../../utils/date.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";

/**
 * Whether this item is still missing whatever the target produces.
 *
 * Deliberately independent of the re-run toggle. It was not, and that made
 * the count it drives meaningless: with re-run on, every item counted as
 * needing the work, so "select all that need it" silently became a second
 * "select all" while still claiming to pick out the ones missing
 * something.
 *
 * Turning re-run on changes what the job *does* to an item, not whether
 * the item is missing anything - so that belongs in the task's own check
 * (stillNeedsWork in bulk-backfill-task.ts), which does consider it, and
 * not here.
 */
export const isMissing = (
  candidate: BulkBackfillCandidate,
  target: BulkBackfillTarget,
  /**
   * Already being worked on right now - so not missing anything, whatever
   * the database still says. The work is in flight and about to land, and
   * offering it again just queues the same transcription twice.
   */
  working = false
): boolean => {
  if (working) {
    return false;
  }
  switch (target) {
    case "subtitles":
      return !candidate.hasSubtitles;
    case "ai_analysis":
      return !candidate.hasAnalysis;
    case "df_article":
      // Not merely "has no article": an item whose last search missed
      // recently is deliberately left alone until its backoff expires,
      // because Digital Foundry may not have written the piece yet and
      // asking again immediately would just spend a request to learn the
      // same thing.
      return !candidate.hasArticle && candidate.articleLookupDue;
  }
};

/**
 * What the analysis will have to work from, beyond the title and description
 * it always has.
 *
 * Both matter to the result rather than being trivia: a transcript is what
 * lets it quote what was actually said, and an article is written rather than
 * transcribed, so its product names and figures are right where speech-to-text
 * garbles exactly those. An item with neither can still be analysed, but from
 * a title alone - which is worth seeing before choosing three hundred of them.
 *
 * "Subtitles" here means a subtitle file this app knows about. Analysis can
 * also pull a transcript out of a video that carries one internally, which
 * nothing recorded against the content would show - so this can understate
 * what is available, never overstate it.
 */
export const analysisSourcesFor = (candidate: BulkBackfillCandidate) => {
  const sources = [
    candidate.hasSubtitles ? "transcript" : undefined,
    candidate.hasArticle ? "article" : undefined,
  ].filter(Boolean) as string[];
  return { sources, count: sources.length };
};

/** Why an item already in the selection would be passed over. */
export const SKIP_REASONS: Record<BulkBackfillTarget, string> = {
  subtitles: "they already have subtitles",
  ai_analysis: "they have already been analysed",
  df_article: "they already have an article, or were searched too recently to be worth asking again",
};

/** What this item already has, in the terms of the selected target. */
const statusFor = (candidate: BulkBackfillCandidate, target: BulkBackfillTarget, working = false) => {
  // Beats what the database says: an item mid-transcription still has no
  // subtitles, and reading "No subtitles" next to a running job is how you
  // end up queueing it a second time.
  if (working) {
    return { label: "Working", tone: "working" as const };
  }
  switch (target) {
    case "subtitles":
      return candidate.hasSubtitles
        ? { label: "Has subtitles", tone: "done" as const }
        : { label: "No subtitles", tone: "todo" as const };
    case "ai_analysis":
      return candidate.hasAnalysis
        ? { label: "Analysed", tone: "done" as const }
        : { label: "Not analysed", tone: "todo" as const };
    case "df_article":
      if (candidate.hasArticle) {
        return { label: "Article matched", tone: "done" as const };
      }
      return candidate.articleLookupDue
        ? { label: "Not searched", tone: "todo" as const }
        : { label: "Searched recently", tone: "waiting" as const };
  }
};

type BackfillRowProps = {
  candidate: BulkBackfillCandidate;
  target: BulkBackfillTarget;
  selected: boolean;
  /** A primitive, not the set it came from - see the note on memoisation. */
  working: boolean;
  onToggle: (contentKey: string, selected: boolean) => void;
};

/**
 * Memoised, and that is load-bearing rather than tidiness.
 *
 * The article target offers every item with a YouTube video - thousands
 * of rows. Without this, ticking one checkbox re-rendered all of them,
 * because the parent holds the selection and re-renders on every change.
 * Each row carries a MUI Checkbox and Chip, so that was thousands of
 * component renders per click and the list visibly lagged behind the
 * cursor.
 *
 * The props are deliberately all primitives or stable references -
 * `selected` is a boolean rather than the selection Set, whose identity
 * changes on every toggle and would defeat the comparison entirely.
 */
const SourcesLabel = ({ candidate }: { candidate: BulkBackfillCandidate }) => {
  const { sources, count } = analysisSourcesFor(candidate);
  return (
    <Typography
      variant="caption"
      sx={{
        flexShrink: 0,
        whiteSpace: "nowrap",
        fontSize: "0.68rem",
        // Nothing to work from is the case worth noticing, so it is the only
        // one that gets a colour.
        color: count ? "text.disabled" : "warning.main",
      }}
    >
      {count ? `${count} source${count === 1 ? "" : "s"}: ${sources.join(", ")}` : "title only"}
    </Typography>
  );
};

const StatusChip = ({ status }: { status: ReturnType<typeof statusFor> }) => (
  <Chip
    size="small"
    variant="outlined"
    label={status.label}
    sx={{
      height: 20,
      fontSize: "0.68rem",
      flexShrink: 0,
      ...(status.tone === "done"
        ? { color: "success.main", borderColor: "success.main" }
        : status.tone === "working"
          ? { color: "info.main", borderColor: "info.main" }
          : status.tone === "waiting"
            ? { color: "text.disabled" }
            : { color: "warning.main", borderColor: "warning.main" }),
    }}
  />
);

/**
 * The same row, stacked, for a phone.
 *
 * Four columns with a 200px minimum on the title cannot fit a handset, so
 * the grid was scrolling sideways and the status chip - the thing you are
 * scanning the list for - sat off the edge. Stacked, the title gets the
 * width and the date and status sit under it where they are still visible.
 *
 * Memoised for the same reason the grid row is: the article target lists
 * thousands of rows and the parent re-renders on every tick of a checkbox.
 */
const BackfillStackedRow = memo(({ candidate, target, selected, working, onToggle }: BackfillRowProps) => {
  const status = statusFor(candidate, target, working);
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "flex-start", paddingY: 0.75, borderBottom: 1, borderColor: "divider" }}
    >
      <Checkbox
        size="small"
        checked={selected}
        disableRipple
        onChange={(event) => onToggle(candidate.contentKey, event.target.checked)}
        inputProps={{ "aria-label": `Select ${candidate.title}` }}
        sx={{ padding: 0.5, marginTop: "-2px" }}
      />
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
          {candidate.title}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", marginTop: 0.5 }}>
          <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: monoFontFamily }}>
            {conciseFormatDate(candidate.publishedDate)}
          </Typography>
          <StatusChip status={status} />
          {target === "ai_analysis" && <SourcesLabel candidate={candidate} />}
        </Stack>
      </Box>
    </Stack>
  );
});
BackfillStackedRow.displayName = "BackfillStackedRow";

const BackfillRow = memo(({ candidate, target, selected, working, onToggle }: BackfillRowProps) => {
  const status = statusFor(candidate, target, working);
  return (
    <GridRow sx={{ alignItems: "center" }}>
      <GridCell>
        <Checkbox
          size="small"
          checked={selected}
          // The ripple animates per click across a very long list, and
          // costs more than it communicates for a plain row checkbox.
          disableRipple
          onChange={(event) => onToggle(candidate.contentKey, event.target.checked)}
          inputProps={{ "aria-label": `Select ${candidate.title}` }}
        />
      </GridCell>
      <GridTextCell variant="body2">{candidate.title}</GridTextCell>
      <GridCell>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", fontFamily: monoFontFamily, whiteSpace: "nowrap" }}
        >
          {conciseFormatDate(candidate.publishedDate)}
        </Typography>
      </GridCell>
      <GridCell>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <StatusChip status={status} />
          {target === "ai_analysis" && <SourcesLabel candidate={candidate} />}
        </Stack>
      </GridCell>
    </GridRow>
  );
});
BackfillRow.displayName = "BackfillRow";

export type BackfillTableProps = {
  candidates: BulkBackfillCandidate[];
  target: BulkBackfillTarget;
  selected: Set<string>;
  /** Content currently being worked on, whoever started it. */
  workingKeys: Set<string>;
  onToggle: (contentKey: string, selected: boolean) => void;
};

const BACKFILL_COLUMNS: ColumnInfo[] = [
  { name: "", size: "min-content" },
  { name: "Content", size: "minmax(200px, 1fr)" },
  { name: "Published", size: "min-content" },
  { name: "Status", size: "min-content" },
];

export const BackfillTable = ({ candidates, target, selected, workingKeys, onToggle }: BackfillTableProps) => {
  const stacked = useMediaQuery("(max-width:899.95px)");
  if (stacked) {
    return (
      <Box>
        {candidates.map((candidate) => (
          <BackfillStackedRow
            key={candidate.contentKey}
            candidate={candidate}
            target={target}
            selected={selected.has(candidate.contentKey)}
            working={workingKeys.has(candidate.contentKey)}
            onToggle={onToggle}
          />
        ))}
      </Box>
    );
  }
  return (
    <GridTable columns={BACKFILL_COLUMNS}>
      {candidates.map((candidate) => (
        <BackfillRow
          key={candidate.contentKey}
          candidate={candidate}
          target={target}
          selected={selected.has(candidate.contentKey)}
          working={workingKeys.has(candidate.contentKey)}
          onToggle={onToggle}
        />
      ))}
    </GridTable>
  );
};

export type BackfillConfirmDialogProps = {
  open: boolean;
  target: BulkBackfillTarget;
  count: number;
  force: boolean;
  estimate: BulkBackfillEstimate | null;
  estimating: boolean;
  /** How many of the selected items the run will skip as already done. */
  willSkip: number;
  onCancel: () => void;
  onConfirm: () => void;
};

export const formatCost = (costUsd: number) => (costUsd < 0.01 ? "<$0.01" : `$${costUsd.toFixed(2)}`);

/**
 * Confirmation, carrying the cost of what is about to happen.
 *
 * The estimate is shown here rather than behind a disclosure, which is a
 * deliberate departure from the single-item analysis panel. There, cost is
 * a detail about a run that already happened; here it is the decision
 * being made, and it scales with a number the user just chose - clicking
 * through without seeing it is how someone spends real money on a
 * thousand items by accident.
 */
export const BackfillConfirmDialog = ({
  open,
  target,
  count,
  force,
  estimate,
  estimating,
  willSkip,
  onCancel,
  onConfirm,
}: BackfillConfirmDialogProps) => (
  <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
    <DialogTitle>
      {BulkBackfillTargetLabels[target]} for {count} {count === 1 ? "item" : "items"}?
    </DialogTitle>
    <DialogContent>
      <DialogContentText component="div">
        <Stack spacing={1.5}>
          {force && (
            <Alert severity="warning" variant="outlined">
              {target === "subtitles" && "Items that already have subtitles will be transcribed again, replacing them."}
              {target === "ai_analysis" && "Items that have already been analysed will be analysed again, and charged for again."}
              {target === "df_article" && "Items that already have a matched article will be searched for again."}
            </Alert>
          )}

          {willSkip > 0 && (
            <Alert severity="info" variant="outlined">
              A further {willSkip} {willSkip === 1 ? "item is" : "items are"} selected but will not be touched, because{" "}
              {SKIP_REASONS[target]}. Turn on the re-run option if you meant to redo them.
            </Alert>
          )}

          {estimating && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={14} />
              <Typography variant="body2">Working out what this will cost…</Typography>
            </Stack>
          )}

          {estimate && !estimating && (
            <Box>
              {estimate.estimatedCostUsd != null && (
                <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2">Estimated cost</Typography>
                  <Typography sx={{ fontFamily: monoFontFamily, fontWeight: 600, color: "primary.main" }}>
                    {formatCost(estimate.estimatedCostUsd)}
                  </Typography>
                  {estimate.sampledCount > 0 && (
                    <Typography variant="caption" sx={{ color: "text.disabled" }}>
                      from {estimate.sampledCount} priced {estimate.sampledCount === 1 ? "item" : "items"}, scaled to{" "}
                      {estimate.itemCount}
                    </Typography>
                  )}
                </Stack>
              )}
              {estimate.estimatedDfRequests != null && (
                <Typography variant="body2">
                  Up to {estimate.estimatedDfRequests.toLocaleString()} requests to Digital Foundry
                </Typography>
              )}
              {estimate.note && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                  {estimate.note}
                </Typography>
              )}
            </Box>
          )}

          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            This runs in the background - you can watch it, and cancel it, on the Activity page.
          </Typography>
        </Stack>
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="contained" onClick={onConfirm}>
        Start
      </Button>
    </DialogActions>
  </Dialog>
);
