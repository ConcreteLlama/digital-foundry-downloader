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
  Divider,
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
import { useCallback, useEffect, useState } from "react";
import { decideAiTag, estimateAiAnalysisCost, fetchAiAnalysis, startAiAnalysis } from "../../../api/ai-analysis.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";
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
};

export const AiAnalysisPanel = ({ contentKey, enabled }: AiAnalysisPanelProps) => {
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

  const runAnalysis = async (force: boolean) => {
    setStarting(true);
    try {
      await startAiAnalysis(contentKey, force);
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

  if (!enabled) {
    return (
      <Alert severity="info" variant="outlined">
        AI analysis is turned off. Enable it and add an Anthropic API key in Settings &rsaquo; AI Analysis.
      </Alert>
    );
  }

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
    return (
      <Stack spacing={1.5}>
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
            onClick={() => runAnalysis(false)}
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
        <Alert severity="error" variant="outlined">
          Analysis failed: {result.error}
        </Alert>
        <Box>
          <Button size="small" variant="outlined" disabled={starting} onClick={() => runAnalysis(true)}>
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
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" color="primary" label={AiContentTypeLabels[result.contentType]} />
        <Box sx={{ flex: "1 1 auto" }} />
        <Tooltip title="Analyse again, replacing this result">
          <span>
            <Button size="small" disabled={starting} onClick={() => runAnalysis(true)}>
              Re-analyse
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <EvidenceStrip evidence={result.evidence} />

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
          <Typography variant="body2" sx={{ mt: 0.5 }}>
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
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {result.conclusion}
          </Typography>
        </Paper>
      )}

      {result.structuredData && (
        <>
          <Divider />
          <AnalysisStructuredData data={result.structuredData} />
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
        {open ? "Hide run details" : "Run details"}
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
