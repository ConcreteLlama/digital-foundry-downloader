import { Alert, Button, Stack, Typography } from "@mui/material";
import { useState } from "react";
import { API_URL } from "../../../config";

type EmptyAnalysis = { contentKey: string; contentType: string; model?: string; reason: string };
type PurgeResult = { examined: number; empty: EmptyAnalysis[]; removed: boolean };

const purge = async (confirm: boolean): Promise<PurgeResult> => {
  const response = await fetch(`${API_URL}/ai-analysis/purge-empty`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ confirm }),
  });
  const body = await response.json();
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error?.message ?? `The service returned ${response.status}`);
  }
  return body.data as PurgeResult;
};

/**
 * Deletes analyses that hold nothing, so they get done again.
 *
 * Deletion rather than a "redo these" button on purpose. A scheduled run picks
 * up anything with no analysis, so removing an empty one is enough for it to
 * be redone in the next window - no bulk job in the middle of the day, and no
 * change to what the scheduler considers eligible.
 *
 * Always counts before it deletes. This throws away results, and the count is
 * also the answer to "did something go wrong last night": one or two is
 * ordinary, four hundred is a story.
 */
export const ClearEmptyAnalysesView = () => (
  <Typography variant="body2" color="text.secondary">
    Finds analyses that came back with nothing - an error, or no summary, verdict, details or tags. Removing them puts
    those videos back in the queue for a scheduled run, so they are redone overnight rather than by starting a backfill
    now. Analyses that hold anything at all are left alone.
  </Typography>
);

export const ClearEmptyAnalysesButton = () => {
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<PurgeResult | undefined>();
  const [error, setError] = useState<string | undefined>();

  const run = async (confirm: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await purge(confirm);
      setFound(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check the stored analyses");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={1} alignItems="center" sx={{ width: "100%" }}>
      {error && <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert>}
      {found && !found.removed && (
        <Alert severity={found.empty.length ? "warning" : "success"} sx={{ width: "100%" }}>
          {found.empty.length
            ? `${found.empty.length} of ${found.examined} stored analyses hold nothing. Nothing has been removed yet.`
            : `All ${found.examined} stored analyses hold something. Nothing to clear.`}
        </Alert>
      )}
      {found?.removed && (
        <Alert severity="success" sx={{ width: "100%" }}>
          Removed {found.empty.length}. They will be analysed again in the next scheduled window.
        </Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" disabled={busy} onClick={() => void run(false)}>
          {busy ? "Checking..." : "Check"}
        </Button>
        {/* Only offered once a count exists - see the note on the view above. */}
        <Button
          variant="contained"
          color="warning"
          disabled={busy || !found || found.removed || found.empty.length === 0}
          onClick={() => void run(true)}
        >
          Remove {found && !found.removed ? found.empty.length : ""}
        </Button>
      </Stack>
    </Stack>
  );
};
