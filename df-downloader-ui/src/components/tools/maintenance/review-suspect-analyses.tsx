import { Alert, Button, Checkbox, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { API_URL } from "../../../config";
import { monoFontFamily } from "../../../themes/build-theme";

type SuspectAnalysis = {
  contentKey: string;
  contentType: string;
  model?: string;
  analysedAt?: string;
  reasons: string[];
};

const post = async (path: string, body: unknown) => {
  const response = await fetch(`${API_URL}/ai-analysis/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const parsed = await response.json();
  if (!response.ok || parsed?.success === false) {
    throw new Error(parsed?.error?.message ?? `The service returned ${response.status}`);
  }
  return parsed.data;
};

/**
 * Finds analyses that may have come from a broken engine.
 *
 * Distinct from Clear Empty Analyses, which only catches results holding
 * nothing. The failure this is for produces a confident classification and a
 * plausible summary - see docs/GPU_ACCELERATION_FINDINGS.md - so it passes
 * every check the app has, counts as analysed, and is skipped forever by the
 * scheduled backfill because a record exists.
 *
 * There is no reliable test for "wrong but plausible": if there were, the
 * analysis would apply it itself and reject the result. So this reports what
 * it can genuinely detect and otherwise lets you pick a time window, which is
 * the honest lever when you know when a run went wrong but not which items it
 * spoiled.
 */
export const ReviewSuspectAnalysesView = () => (
  <Typography variant="body2" color="text.secondary">
    Lists stored analyses so you can remove ones you no longer trust - for a run you know went wrong, or where the
    result looks like a broken engine rather than a bad judgement. Filter by when they were made and which model made
    them. Nothing is removed until you choose it, and removing one puts that video back in the queue for a scheduled
    run. This is separate from Clear Empty Analyses, which only finds results holding nothing at all.
  </Typography>
);

export const ReviewSuspectAnalysesButton = () => {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [model, setModel] = useState("qwen");
  const [found, setFound] = useState<SuspectAnalysis[] | undefined>();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const find = async () => {
    setBusy(true);
    setError(undefined);
    setRemoved(undefined);
    try {
      const data = await post("suspect", { from: from || undefined, to: to || undefined, model: model || undefined });
      const analyses = (data?.analyses ?? []) as SuspectAnalysis[];
      setFound(analyses);
      // Pre-ticked where something is genuinely detectable; the rest is a
      // judgement the window cannot make for you.
      setChosen(new Set(analyses.filter((a) => a.reasons.length).map((a) => a.contentKey)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the stored analyses");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const data = await post("purge", { contentKeys: [...chosen] });
      setRemoved(data?.removed ?? chosen.size);
      setFound(undefined);
      setChosen(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove those analyses");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      {error && <Alert severity="error">{error}</Alert>}
      {removed !== undefined && (
        <Alert severity="success">
          Removed {removed}. Those videos will be analysed again in a scheduled window.
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
        {/* Local time in, ISO out - the service parses whatever Date accepts. */}
        <TextField
          size="small"
          label="From"
          type="datetime-local"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="To"
          type="datetime-local"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="Model contains"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          helperText="Blank for any"
          sx={{ minWidth: 150 }}
        />
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" disabled={busy} onClick={() => void find()}>
          {busy ? "Working..." : "Find"}
        </Button>
        <Button variant="contained" color="warning" disabled={busy || chosen.size === 0} onClick={() => void remove()}>
          Remove {chosen.size || ""}
        </Button>
      </Stack>
      {found?.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          No stored analyses match those filters.
        </Typography>
      )}
      {found && found.length > 0 && (
        <Stack spacing={0.5} sx={{ maxHeight: 320, overflowY: "auto", width: "100%" }}>
          <Typography variant="caption" color="text.secondary">
            {found.length} found. {found.filter((a) => a.reasons.length).length} show signs of a broken engine and are
            ticked; the rest are ticked only if you decide the whole window is suspect.
          </Typography>
          {found.map((analysis) => (
            <Stack
              key={analysis.contentKey}
              direction="row"
              spacing={1}
              sx={{ alignItems: "flex-start", borderBottom: 1, borderColor: "divider", paddingY: 0.5 }}
            >
              <Checkbox
                size="small"
                checked={chosen.has(analysis.contentKey)}
                onChange={() => toggle(analysis.contentKey)}
              />
              <Stack sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontFamily: monoFontFamily, fontSize: "0.7rem", wordBreak: "break-all" }}>
                  {analysis.contentKey}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {analysis.contentType}
                  {analysis.model ? ` · ${analysis.model}` : ""}
                  {analysis.analysedAt ? ` · ${new Date(analysis.analysedAt).toLocaleString()}` : ""}
                </Typography>
                {analysis.reasons.length > 0 && (
                  <Typography variant="caption" color="warning.main">
                    {analysis.reasons.join("; ")}
                  </Typography>
                )}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
};
