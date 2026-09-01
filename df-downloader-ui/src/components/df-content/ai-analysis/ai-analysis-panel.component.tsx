import { AiAnalysisSourceSelection } from "df-downloader-common";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AiAnalysisCostEstimate,
  AiAnalysisResult,
  AiContentTypeLabels,
  AiEvidenceSource,
  AiEvidenceSourceLabels,
  AiTagStatus,
} from "df-downloader-common";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { selectQueryPipelineIds } from "../../../store/df-tasks/tasks.selector.ts";
import { decideAiTag, estimateAiAnalysisCost, fetchAiAnalysis, startAiAnalysis } from "../../../api/ai-analysis.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
import { selectConfigSection } from "../../../store/config/config.selector.ts";
import { AnalysisSourcePicker, DEFAULT_SOURCE_SELECTION } from "./analysis-source-picker.component.tsx";
import { AnalysisStructuredData, SectionLabel } from "./analysis-structured-data.component.tsx";

/**
 * Sub-cent runs are the normal case, so a plain two-decimal format would
 * render almost every analysis as "$0.01" and tell the reader nothing
 * about the difference between a tags-only pass and a full Direct.
 */
const formatCost = (costUsd: number): string => (costUsd < 0.01 ? "<$0.01" : `$${costUsd.toFixed(2)}`);

const ALL_EVIDENCE: AiEvidenceSource[] = ["title", "description", "transcript", "article"];

/**
 * What the analysis actually read, including what it did not.
 *
 * Shown as the full set with the missing ones struck through rather than
 * only listing what was present: "analysed from title and description" is
 * only meaningful if the reader can see that a transcript was the thing
 * absent. This is the transparency requirement made concrete.
 */
const EvidenceStrip = ({ evidence }: { evidence: AiEvidenceSource[] }) => (
  <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
    <SectionLabel>Based on</SectionLabel>
    {ALL_EVIDENCE.map((source) => {
      const used = evidence.includes(source);
      return (
        <Chip
          key={source}
          size="small"
          variant="outlined"
          label={AiEvidenceSourceLabels[source]}
          sx={{
            height: 22,
            fontSize: "0.7rem",
            color: used ? "text.primary" : "text.disabled",
            textDecoration: used ? "none" : "line-through",
          }}
        />
      );
    })}
  </Stack>
);

const TagSuggestions = ({
  result,
  contentKey,
  onUpdated,
}: {
  result: AiAnalysisResult;
  contentKey: string;
  onUpdated: (updated: AiAnalysisResult) => void;
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  const pending = result.tags.filter((tag) => tag.status === "suggested");
  const accepted = result.tags.filter((tag) => tag.status === "accepted");

  const decide = async (tag: string, status: AiTagStatus) => {
    setBusy(tag);
    try {
      onUpdated(await decideAiTag(contentKey, tag, status));
    } finally {
      setBusy(null);
    }
  };

  if (!result.tags.length) {
    return null;
  }

  // A tag inferred from a title alone is a materially weaker claim than one
  // drawn from a transcript. That distinction rides on the chip itself
  // rather than a tooltip, because a tag is filtered on in isolation - by
  // the time it is doing work, the surrounding context is gone.
  const basisLabel = (basis: AiEvidenceSource[]) => {
    if (basis.includes("transcript")) return "from transcript";
    if (basis.includes("article")) return "from article";
    if (basis.includes("description")) return "title + description";
    return "title only";
  };
  const basisIsWeak = (basis: AiEvidenceSource[]) => !basis.includes("transcript") && !basis.includes("article");

  return (
    <Box>
      <SectionLabel>{pending.length ? `Tags (${pending.length} to review)` : "Tags"}</SectionLabel>
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {pending.map((tag) => (
          <Paper key={tag.tag} variant="outlined" sx={{ px: 1.5, py: 0.75 }}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 500, flex: "1 1 auto" }}>
                {tag.tag}
              </Typography>
              {tag.confidence != null && (
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" }}
                >
                  {tag.confidence.toFixed(2)}
                </Typography>
              )}
              <Chip
                size="small"
                variant="outlined"
                label={basisLabel(tag.basis)}
                sx={{
                  height: 20,
                  fontSize: "0.68rem",
                  ...(basisIsWeak(tag.basis) ? { color: "warning.main", borderColor: "warning.main" } : { color: "text.disabled" }),
                }}
              />
              <Stack direction="row" spacing={0.5}>
                <Button
                  size="small"
                  startIcon={<CheckIcon fontSize="small" />}
                  disabled={busy === tag.tag}
                  onClick={() => decide(tag.tag, "accepted")}
                >
                  Accept
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<CloseIcon fontSize="small" />}
                  disabled={busy === tag.tag}
                  onClick={() => decide(tag.tag, "rejected")}
                >
                  Reject
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ))}
        {/* Applied tags get a remove control rather than a confirmation step.
            Tags are applied as soon as they are inferred, so what is needed
            here is not "do you approve" but "take that one off" - the
            decision only becomes interesting once a tag is visibly wrong. */}
        {accepted.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: pending.length ? 1 : 0 }}>
            {accepted.map((tag) => (
              <Tooltip
                key={tag.tag}
                title={`Inferred ${basisLabel(tag.basis)}${
                  tag.confidence != null ? ` · confidence ${tag.confidence.toFixed(2)}` : ""
                }. Remove to take it off this content.`}
              >
                <Chip
                  size="small"
                  variant="outlined"
                  label={tag.tag}
                  disabled={busy === tag.tag}
                  onDelete={() => decide(tag.tag, "rejected")}
                  sx={{
                    // Weakly-evidenced tags are marked rather than hidden -
                    // they are applied either way, so the reader needs to see
                    // which ones rest on a title alone.
                    ...(basisIsWeak(tag.basis)
                      ? { color: "warning.main", borderColor: "warning.main" }
                      : { color: "primary.main", borderColor: "primary.main" }),
                  }}
                />
              </Tooltip>
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export type AiAnalysisPanelProps = {
  contentKey: string;
  /** False when analysis is off or unconfigured - the panel then explains rather than offering a button that cannot work. */
  enabled: boolean;
  /** Reports whether an analysis exists, so a tab can indicate it. */
  onHasContent?: (hasContent: boolean) => void;
  /**
   * Jump the video to a moment. Absent when there is nothing to drive - a
   * YouTube embed, or an item with no downloaded file - and findings then
   * show no jump control at all rather than a dead one.
   */
  onJumpTo?: (seconds: number) => void;
};

export const AiAnalysisPanel = ({ contentKey, enabled, onHasContent, onJumpTo }: AiAnalysisPanelProps) => {
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [estimate, setEstimate] = useState<AiAnalysisCostEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await fetchAiAnalysis(contentKey));
    } finally {
      setLoading(false);
    }
  }, [contentKey]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lets the tab this sits behind show whether there is anything in it.
  // Reported from here rather than fetched again by the parent, because
  // this panel already knows and a second request for a boolean would be
  // the same call twice.
  useEffect(() => {
    onHasContent?.(Boolean(result));
  }, [result, onHasContent]);

  /**
   * Reloads when this content's analysis pipeline finishes.
   *
   * The result is fetched over REST rather than living in the store, so
   * nothing would otherwise tell this panel that the run it started has
   * produced anything - it sat showing "not analysed yet" until the page
   * was reloaded by hand. Pipeline state is already pushed to the store
   * over the existing event stream, so watching for this content's own
   * analysis pipeline to disappear from the in-flight set is enough, and
   * costs no polling.
   */
  const runningAnalysisIds = useSelector(
    selectQueryPipelineIds({
      filter: { contentName: contentKey, pipelineType: "ai_analysis", state: "incomplete" },
    })
  );
  const analysisRunning = runningAnalysisIds.length > 0;
  const wasRunning = useRef(false);

  useEffect(() => {
    // Only on the falling edge - reloading while it is still running would
    // just re-fetch the absence of a result.
    if (wasRunning.current && !analysisRunning) {
      void load();
    }
    wasRunning.current = analysisRunning;
  }, [analysisRunning, load]);

  /*
   * Both entry points ask which sources to use before spending anything.
   * The settings say what you normally want; this is for the run where you
   * want something else - usually skipping the transcript, which is nearly
   * all of the cost. The choice applies to this run only.
   */
  const [sourcePrompt, setSourcePrompt] = useState<{ force: boolean } | null>(null);
  const [sources, setSources] = useState<AiAnalysisSourceSelection>(DEFAULT_SOURCE_SELECTION);
  const [sourcesTouched, setSourcesTouched] = useState(false);
  const aiConfig = useSelector(selectConfigSection("aiAnalysis"));

  useEffect(() => {
    if (!sourcesTouched && aiConfig?.sources) {
      setSources(aiConfig.sources);
    }
  }, [aiConfig, sourcesTouched]);

  /*
   * Rendered in each branch that can open it rather than once at the top,
   * because this component returns early for loading/empty/error states. A
   * MUI Dialog portals to the body, so where it sits in the tree costs
   * nothing.
   */
  const sourceDialog = (
    <Dialog open={Boolean(sourcePrompt)} onClose={() => setSourcePrompt(null)} maxWidth="xs" fullWidth>
      <DialogTitle>{sourcePrompt?.force ? "Analyse again" : "Analyse this content"}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <AnalysisSourcePicker
            value={sources}
            onChange={(next) => {
              setSourcesTouched(true);
              setSources(next);
            }}
          />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            Defaults come from your AI analysis settings. Changing them here applies to this run only.
          </Typography>
          {sourcePrompt?.force && (
            <Typography variant="caption" sx={{ color: "warning.main" }}>
              This replaces the stored result and is charged for again.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={() => setSourcePrompt(null)}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          disabled={starting}
          onClick={() => runAnalysis(Boolean(sourcePrompt?.force))}
        >
          Analyse
        </Button>
      </DialogActions>
    </Dialog>
  );

  const runAnalysis = async (force: boolean) => {
    setSourcePrompt(null);
    setStarting(true);
    try {
      await startAiAnalysis(contentKey, force, sources);
    } finally {
      setStarting(false);
    }
  };

  // Fetched on demand rather than on open: it costs a token-counting
  // request per item, and most opens of a content panel are not about
  // analysing it.
  const loadEstimate = async () => {
    try {
      setEstimate(await estimateAiAnalysisCost(contentKey));
    } catch {
      setEstimate(null);
    }
  };

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 2 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Loading analysis…
        </Typography>
      </Stack>
    );
  }

  if (!result) {
    // The only branch where being switched off decides what is shown -
    // there is nothing stored to display, so all that is left is why
    // the Analyse button is absent.
    if (!enabled) {
      return (
        <Alert severity="info" variant="outlined">
          AI analysis is turned off. Enable it and add an Anthropic API key in Settings &rsaquo; AI Analysis.
        </Alert>
      );
    }
    // A run already in flight, with nothing stored yet. Saying "not
    // analysed yet" next to a live Analyse button here invites a second
    // run of something already being paid for.
    if (analysisRunning) {
      return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Analysing… this will appear here when it finishes.
          </Typography>
        </Stack>
      );
    }

    return (
      <Stack spacing={1.5}>
        {sourceDialog}
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          This content has not been analysed yet.
        </Typography>
        {estimate && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "background.default" }}>
            <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Estimated cost
              </Typography>
              <Typography sx={{ fontFamily: monoFontFamily, fontWeight: 600, color: "primary.main" }}>
                {formatCost(estimate.estimatedCostUsd)}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.disabled" }}>
                {estimate.inputTokens.toLocaleString()} input tokens, counted not guessed
                {estimate.tagsOnly ? " · no transcript found, so tags only" : ""}
              </Typography>
            </Stack>
          </Paper>
        )}
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={loadEstimate} disabled={Boolean(estimate)}>
            Estimate cost
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<AutoAwesomeIcon fontSize="small" />}
            disabled={starting}
            onClick={() => setSourcePrompt({ force: false })}
          >
            Analyse
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (result.error) {
    return (
      <Stack spacing={1.5}>
        {sourceDialog}
        <Alert severity="error" variant="outlined">
          Analysis failed: {result.error}
        </Alert>
        <Box>
          <Button size="small" variant="outlined" disabled={starting || !enabled || analysisRunning} onClick={() => setSourcePrompt({ force: true })}>
            Try again
          </Button>
        </Box>
      </Stack>
    );
  }

  const usedTranscript = result.evidence.includes("transcript");
  const hasArticle = result.evidence.includes("article");

  return (
    <Stack spacing={2}>
      {sourceDialog}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" color="primary" label={AiContentTypeLabels[result.contentType]} />
        <Box sx={{ flex: "1 1 auto" }} />
        <Tooltip
          title={
            enabled
              ? "Analyse again, replacing this result"
              : "AI analysis is turned off, so this cannot be re-run. The result below was saved when it was on."
          }
        >
          <span>
            <Button size="small" disabled={starting || !enabled || analysisRunning} onClick={() => setSourcePrompt({ force: true })}>
              Re-analyse
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <EvidenceStrip evidence={result.evidence} />

      {/* Credits the written source when one was matched. Worth naming
          rather than leaving as a generic "article" chip: for a review, the
          article is human-written and human-checked where the transcript is
          machine-heard, so knowing the analysis had it is the difference
          between a figure that was read and one that was misheard. */}
      {result.articleUrl && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Grounded in Digital Foundry's article{" "}
          <Link href={result.articleUrl} target="_blank" rel="noopener noreferrer" underline="hover">
            {result.articleTitle || result.articleUrl}
          </Link>
        </Typography>
      )}

      {/* "Not yet" rather than "failed" - a transcript may simply not exist
          for this item at the moment, and the fix is a concrete next step
          rather than a retry of the same thing. */}
      {!usedTranscript && !hasArticle && (
        <Alert severity="warning" variant="outlined">
          Analysed from the title and description only - no transcript existed when this ran, so there is no summary
          or structured data, only tags. Generate subtitles for this video and analyse again for the full result.
        </Alert>
      )}

      {result.summary && (
        <Box>
          <SectionLabel>Summary</SectionLabel>
          {/* Summaries are written as paragraphs, and HTML collapses the
              breaks between them by default - the same reason the content
              description sets this. Without it a multi-paragraph summary
              renders as one unbroken block. */}
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-line" }}>
            {result.summary}
          </Typography>
        </Box>
      )}

      {result.conclusion && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, borderLeft: 3, borderLeftColor: "primary.main", bgcolor: "background.default" }}
        >
          <SectionLabel>Verdict</SectionLabel>
          <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-line" }}>
            {result.conclusion}
          </Typography>
        </Paper>
      )}

      {result.structuredData && (
        <>
          <Divider />
          <AnalysisStructuredData data={result.structuredData} onJumpTo={onJumpTo} />
        </>
      )}

      {result.tags.length > 0 && (
        <>
          <Divider />
          <TagSuggestions result={result} contentKey={contentKey} onUpdated={setResult} />
        </>
      )}

      <RunDetails result={result} />
    </Stack>
  );
};

/**
 * Model, tokens and cost, behind a disclosure.
 *
 * Deliberately not on the face of the panel. What a run cost is worth being
 * able to find, but it is not what the panel is for - showing it beside
 * every summary makes the price the headline of a feature whose output is
 * the point, and at a penny a video it is not information anyone needs on
 * every read.
 *
 * The button says cost is in here, though. Keeping the number off the face
 * is the decision; leaving no clue where it went was just an oversight, and
 * a disclosure nobody opens hides it as effectively as not storing it.
 */
const RunDetails = ({ result }: { result: AiAnalysisResult }) => {
  const [open, setOpen] = useState(false);
  if (!result.usage) {
    return null;
  }
  return (
    <Box>
      <Button
        size="small"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        sx={{ color: "text.disabled", textTransform: "none", px: 0.5, minWidth: 0 }}
      >
        {open ? "Hide cost and run details" : "Cost and run details"}
      </Button>
      <Collapse in={open}>
        <Stack
          direction="row"
          spacing={2}
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 0.5, color: "text.disabled", fontFamily: monoFontFamily, fontSize: "0.72rem" }}
        >
          <span>{result.model}</span>
          <span>{result.usage.inputTokens.toLocaleString()} in</span>
          <span>{result.usage.outputTokens.toLocaleString()} out</span>
          <span>{formatCost(result.usage.costUsd)}</span>
          <span>{new Date(result.analysedAt).toLocaleString()}</span>
        </Stack>
      </Collapse>
    </Box>
  );
};
