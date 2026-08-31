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
import { AiAnalysisConfigUtils } from "df-downloader-common/config/ai-analysis-config";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { queryConfigSection } from "../../../store/config/config.action.ts";
import { selectConfigSection } from "../../../store/config/config.selector.ts";
import { selectPipelinesInCompletionState } from "../../../store/df-tasks/tasks.selector.ts";
import { store } from "../../../store/store.ts";
import { estimateBackfill, fetchBackfillCandidates, runBackfill, stopBackfillJobs } from "../../../api/backfill.ts";
import { triggerSnackbar } from "../../../utils/snackbar.tsx";
import { BackfillConfirmDialog, BackfillTable, formatCost, isMissing, SKIP_REASONS } from "./bulk-backfill.components.tsx";

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

/**
 * How many rows are put in the DOM at once.
 *
 * The article target offers every item with a YouTube video, which here
 * is close to 3,000. Even with the rows memoised, React reconciles every
 * one of them on each toggle, and ticking a checkbox measurably lagged -
 * about 25ms against about 6ms at this page size.
 *
 * Paginated rather than virtualised because the table's columns are
 * sized to their content, and windowing would make them jump as rows
 * scrolled in and out. Pages keep every row reachable, which a bare cap
 * did not.
 *
 * Selection is deliberately independent of the page: it lives in one Set
 * keyed by content, so ticking rows across several pages accumulates,
 * and the select-all buttons act on the whole filtered set rather than
 * the page in view.
 */
const PAGE_SIZE = 250;

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
  /*
    Whether the thing this run needs is actually set up.

    The service already refuses a run it cannot perform and says why, but it
    could only say so after a target was chosen, items were selected and Run
    was pressed - and the cost estimate the confirmation asks for fails
    silently on the way, so the dialog just showed no figure. Checking here
    means the page can say it up front instead of letting someone pick a
    thousand items for a run that was never going to start.
  */
  const aiAnalysisConfig = useSelector(selectConfigSection("aiAnalysis"));
  const subtitlesConfig = useSelector(selectConfigSection("subtitles"));
  useEffect(() => {
    store.dispatch(queryConfigSection.start("aiAnalysis"));
    store.dispatch(queryConfigSection.start("subtitles"));
  }, []);
  const notConfigured = useMemo(() => {
    if (target === "ai_analysis" && !AiAnalysisConfigUtils.isUsable(aiAnalysisConfig ?? undefined)) {
      return "AI analysis is not set up, so this run cannot start. Add an Anthropic API key and turn it on under Settings, AI Analysis.";
    }
    if (target === "subtitles" && !subtitlesConfig?.servicePriorities?.length) {
      return "No subtitles service is set up, so this run cannot start. Choose one under Settings, Subtitles.";
    }
    return undefined;
  }, [target, aiAnalysisConfig, subtitlesConfig]);

  const [filterText, setFilterText] = useState("");
  // Narrowing to what still needs doing is the common case - the list is
  // otherwise mostly rows that are already done and cannot be actioned.
  const [onlyNeedsWork, setOnlyNeedsWork] = useState(false);
  /**
   * Narrow to what the analysis will have something to work from.
   *
   * Analysis-only, because they are about the quality of the result rather
   * than whether the action applies: transcribing does not care whether there
   * is an article, and matching an article does not care about subtitles.
   */
  const [onlyWithSubs, setOnlyWithSubs] = useState(false);
  const [onlyWithArticle, setOnlyWithArticle] = useState(false);
  const [page, setPage] = useState(0);
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

  /**
   * What is being worked on right now, from the live task state.
   *
   * Read from the store rather than asked of the server, so it follows a
   * run as it happens - and so this page does not need its own idea of what
   * is in flight. The article target has no pipeline of its own (that work
   * is done inline by the run), so nothing is ever marked working for it.
   */
  const inFlight = useSelector(useMemo(() => selectPipelinesInCompletionState("incomplete"), []));
  const workingPipelineType = target === "subtitles" ? "subtitles" : target === "ai_analysis" ? "ai_analysis" : null;
  const workingKeys = useMemo(() => {
    if (!workingPipelineType) {
      return new Set<string>();
    }
    return new Set(
      inFlight
        .filter((pipeline) => pipeline.pipelineType === workingPipelineType)
        .map((pipeline) => pipeline.pipelineDetails.dfContent.key)
    );
  }, [inFlight, workingPipelineType]);

  /**
   * How much of what is in flight this page put there.
   *
   * Not an Activity replacement - it is only here to answer "am I already
   * doing this?" before you set another run going on top of the last one.
   */
  const spawnedInFlight = useMemo(
    () => inFlight.filter((pipeline) => pipeline.pipelineDetails.backfillJobId).length,
    [inFlight]
  );
  /**
   * The runs with work still in flight, so the banner can stop exactly what it
   * just counted rather than "everything".
   */
  const spawnedJobIds = useMemo(
    () => [...new Set(inFlight.map((pipeline) => pipeline.pipelineDetails.backfillJobId).filter(Boolean))] as string[],
    [inFlight]
  );
  const [stopping, setStopping] = useState(false);
  const stopSpawned = async () => {
    setStopping(true);
    try {
      const { cancelled, stillRunning } = await stopBackfillJobs(spawnedJobIds);
      setStarted(null);
      setError(null);
      // Says what it stopped rather than assuming: an item that finished
      // between the click and the request is simply no longer there to stop.
      const running = stillRunning
        ? `${stillRunning} already running ${stillRunning === 1 ? "item cannot be interrupted and will finish" : "items cannot be interrupted and will finish"}`
        : "";
      triggerSnackbar(
        cancelled
          ? `Stopped ${cancelled} queued ${cancelled === 1 ? "item" : "items"}${running ? ` - ${running}` : ""}`
          : running || "Nothing left to stop",
        { variant: stillRunning ? "warning" : cancelled ? "success" : "info" }
      );
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop the run");
    } finally {
      setStopping(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = filterText.trim().toLowerCase();
    let list = candidates;
    if (needle) {
      list = list.filter((candidate) => candidate.title.toLowerCase().includes(needle));
    }
    if (onlyNeedsWork) {
      list = list.filter((candidate) => isMissing(candidate, target, workingKeys.has(candidate.contentKey)));
    }
    // Only meaningful for analysis, and left inert elsewhere rather than
    // quietly filtering a list whose controls are not on screen.
    if (target === "ai_analysis" && onlyWithSubs) {
      list = list.filter((candidate) => candidate.hasSubtitles);
    }
    if (target === "ai_analysis" && onlyWithArticle) {
      list = list.filter((candidate) => candidate.hasArticle);
    }
    return list;
  }, [candidates, filterText, onlyNeedsWork, onlyWithSubs, onlyWithArticle, target, workingKeys]);

  useEffect(() => {
    setPage(0);
  }, [filterText, target, onlyNeedsWork, onlyWithSubs, onlyWithArticle]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped rather than reset: narrowing the filter can leave the current
  // page past the end, which would otherwise show an empty table.
  const currentPage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filtered, currentPage]
  );

  /**
   * What the bulk buttons may pick up: only what the run would act on.
   *
   * Never anything already in flight, whatever else is set - queueing an item
   * that is mid-transcription just transcribes it twice, and with re-run on
   * nothing downstream would catch it.
   *
   * And with re-run off, never anything already done, because the run skips
   * those anyway (the same rule runKeys applies below). Ticking a box that is
   * guaranteed to do nothing is a worse way to learn that than the box simply
   * not being ticked, so the buttons now select exactly what will be worked
   * on and their counts say how many that is.
   */
  const isSelectable = useCallback(
    (candidate: BulkBackfillCandidate) =>
      !workingKeys.has(candidate.contentKey) && (force || isMissing(candidate, target)),
    [workingKeys, force, target]
  );
  const selectable = useMemo(() => filtered.filter(isSelectable), [filtered, isSelectable]);
  const visibleSelectable = useMemo(() => visible.filter(isSelectable), [visible, isSelectable]);

  /**
   * The selected items the run would actually do something with.
   *
   * Items that already have the thing are dropped here rather than sent
   * and skipped server-side. That keeps the cost estimate honest - it is
   * priced per item, so including items that will not be worked on would
   * quote money for work that never happens - and it means the count in
   * the confirmation is the count of things about to occur.
   *
   * The dropped ones are still surfaced, because a run that skips
   * everything otherwise looks identical to one that did work: it
   * finishes in milliseconds and never lingers in Activity long enough
   * to see.
   */
  const runKeys = useMemo(() => {
    const selectedKeys = candidates.filter((candidate) => selected.has(candidate.contentKey));
    return (force ? selectedKeys : selectedKeys.filter((candidate) => isMissing(candidate, target))).map(
      (candidate) => candidate.contentKey
    );
  }, [candidates, selected, target, force]);

  const willSkip = selected.size - runKeys.length;

  // Stable across renders, so the memoised rows actually stay memoised -
  // a fresh function identity here would re-render every row per click.
  const toggle = useCallback((contentKey: string, isSelected: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(contentKey);
      } else {
        next.delete(contentKey);
      }
      return next;
    });
  }, []);

  /**
   * Cost for the current selection, asked for rather than volunteered.
   *
   * The confirmation already prices a run, but only once you have decided to
   * start one. This is the same question asked earlier, while you are still
   * choosing what to include - the single-item panel has had it all along,
   * and picking two hundred items is exactly when it matters more.
   *
   * Cleared whenever the selection or the terms change, because a price for a
   * different set of items is worse than no price at all.
   */
  const [inlineEstimate, setInlineEstimate] = useState<BulkBackfillEstimate | null>(null);
  const [inlineEstimating, setInlineEstimating] = useState(false);
  useEffect(() => {
    setInlineEstimate(null);
  }, [selected, force, target]);

  const runInlineEstimate = async () => {
    setInlineEstimating(true);
    setInlineEstimate(null);
    try {
      setInlineEstimate(await estimateBackfill(target, runKeys, force));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not estimate the cost");
    } finally {
      setInlineEstimating(false);
    }
  };

  const openConfirm = async () => {
    setConfirmOpen(true);
    setEstimate(null);
    setEstimating(true);
    try {
      setEstimate(await estimateBackfill(target, runKeys, force));
    } catch {
      setEstimate(null);
    } finally {
      setEstimating(false);
    }
  };

  const confirm = async () => {
    setConfirmOpen(false);
    try {
      const response = await runBackfill(target, runKeys, force);
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
    <Stack sx={{ gap: 1.5, pb: 2 }}>
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

      {notConfigured && (
        <Alert severity="warning" variant="outlined">
          {notConfigured}
        </Alert>
      )}
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
      {/* Persists while the work does, unlike the dismissible "started" note
          above - the question it answers is "am I already doing this?", which
          outlives the moment you pressed the button. */}
      {spawnedInFlight > 0 && (
        <Alert
          severity="info"
          variant="outlined"
          action={
            <Button color="inherit" size="small" disabled={stopping} onClick={() => void stopSpawned()}>
              {stopping ? "Stopping…" : "Stop"}
            </Button>
          }
        >
          {spawnedInFlight} {spawnedInFlight === 1 ? "item" : "items"} queued from here{" "}
          {spawnedInFlight === 1 ? "is" : "are"} still going. Anything being worked on is marked and left out of the
          selection buttons, so starting another run will not queue it twice.
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
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={onlyNeedsWork}
                  onChange={(event) => setOnlyNeedsWork(event.target.checked)}
                />
              }
              label="Needs work only"
              sx={{ marginLeft: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
            />
            {target === "ai_analysis" && (
              <>
                <FormControlLabel
                  control={
                    <Switch size="small" checked={onlyWithSubs} onChange={(e) => setOnlyWithSubs(e.target.checked)} />
                  }
                  label="Has subtitles"
                  sx={{ marginLeft: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={onlyWithArticle}
                      onChange={(e) => setOnlyWithArticle(e.target.checked)}
                    />
                  }
                  label="Has article"
                  sx={{ marginLeft: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
                />
              </>
            )}
            {/* Two buttons, not three: the same pair means different things
                depending on re-run, so they say which. With it off they can
                only take what is missing, because that is all the run would
                act on; with it on they take everything they are offered. */}
            <Button
              size="small"
              variant="outlined"
              disabled={selectable.length === 0}
              onClick={() => setSelected(new Set(selectable.map((candidate) => candidate.contentKey)))}
            >
              {force ? "Select all" : "Select all missing"} ({selectable.length})
            </Button>
            <Button
              size="small"
              disabled={visibleSelectable.length === 0}
              // Adds rather than replaces: selection deliberately accumulates
              // across pages, so this is for building one up a page at a time
              // where the button beside it acts on the whole filtered set.
              onClick={() =>
                setSelected((previous) => {
                  const next = new Set(previous);
                  for (const candidate of visibleSelectable) {
                    next.add(candidate.contentKey);
                  }
                  return next;
                })
              }
            >
              {force ? "Select all on page" : "Select missing on page"} ({visibleSelectable.length})
            </Button>
            {/* Only where there is money at stake. The other targets cost
                time and requests, which the confirmation already states. */}
            {target === "ai_analysis" && (
              <Button
                size="small"
                disabled={runKeys.length === 0 || inlineEstimating}
                onClick={() => void runInlineEstimate()}
              >
                {inlineEstimating ? "Estimating…" : "Estimate cost"}
              </Button>
            )}
            <Button size="small" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button
              variant="contained"
              size="small"
              disabled={runKeys.length === 0 || Boolean(notConfigured)}
              onClick={openConfirm}
            >
              Run ({runKeys.length})
            </Button>
          </Stack>

          {/* Deliberately says "roughly": a handful of the chosen items are
              priced properly and scaled, rather than a token count per item. */}
          {inlineEstimate && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {inlineEstimate.estimatedCostUsd === undefined
                ? `No charge for ${inlineEstimate.itemCount} ${inlineEstimate.itemCount === 1 ? "item" : "items"}`
                : `Roughly ${formatCost(inlineEstimate.estimatedCostUsd)} for ${inlineEstimate.itemCount} ${
                    inlineEstimate.itemCount === 1 ? "item" : "items"
                  }`}
              {inlineEstimate.sampledCount > 0 &&
                ` · from ${inlineEstimate.sampledCount} priced exactly`}
              {inlineEstimate.note && ` · ${inlineEstimate.note}`}
            </Typography>
          )}

          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {candidates.length} of {libraryCount.toLocaleString()} items can take this action
            {filtered.length !== candidates.length && ` · ${filtered.length} match the filter`}
            {selected.size > 0 && ` · ${selected.size} selected across all pages`}
            {willSkip > 0 && ` · ${willSkip} of the ${selected.size} selected will be skipped, ${SKIP_REASONS[target]}`}
          </Typography>

          <BackfillTable
            candidates={visible}
            target={target}
            selected={selected}
            workingKeys={workingKeys}
            onToggle={toggle}
          />

          {pageCount > 1 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Button size="small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                Page {currentPage + 1} of {pageCount}
              </Typography>
              <Button
                size="small"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </Stack>
          )}

        </>
      )}

      <BackfillConfirmDialog
        open={confirmOpen}
        target={target}
        count={runKeys.length}
        force={force}
        estimate={estimate}
        estimating={estimating}
        willSkip={willSkip}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={confirm}
      />
    </Stack>
  );
};
