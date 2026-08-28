import CloudSyncIcon from "@mui/icons-material/CloudSync";
import { Badge, Box, Button, Chip, Divider, IconButton, Popover, Stack, Tooltip, Typography } from "@mui/material";
import { DfRequestEntry, QueueStatusResponse, parseResponseBody } from "df-downloader-common";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";
import { subscribeToChannel } from "../../store/realtime/realtime-stream";

/**
 * Countdowns ("sending in 8s") need to tick faster than the poll or they
 * visibly jump in 5s steps. Only runs while the popover is actually open.
 */
const COUNTDOWN_TICK_MS = 1000;

const secondsUntil = (epochMs: number | null, now: number) =>
  epochMs === null ? 0 : Math.max(0, Math.round((epochMs - now) / 1000));

/**
 * What a request is doing, in the terms someone watching the queue
 * actually cares about: is it talking to DF, deliberately pausing, or just
 * waiting its turn.
 */
const describePhase = (request: DfRequestEntry, now: number): { text: string; color: "default" | "primary" | "warning" } => {
  switch (request.phase) {
    case "in_flight":
      return { text: "Sending", color: "primary" };
    case "waiting":
      // The spacing gate - the request is next up but deliberately held
      // back so we don't hammer DF. Worth spelling out: this is the state
      // that most often looks like the app has silently frozen.
      return { text: `Pausing ${secondsUntil(request.waitingUntil, now)}s`, color: "default" };
    case "backing_off":
      return {
        text: `Rate limited - retrying in ${secondsUntil(request.waitingUntil, now)}s (attempt ${request.attempt})`,
        color: "warning",
      };
    case "queued":
    default:
      return { text: "Waiting its turn", color: "default" };
  }
};

/**
 * Small, always-visible nav bar indicator for the Digital Foundry request
 * queue - added because the queue's own protections (strict serialization,
 * 5-15s spacing, 429/503 backoff - see df-request-queue.ts) mean actions
 * that hit it can visibly pause with no on-screen explanation otherwise.
 * Click for a breakdown; the icon itself just shows whether anything's
 * happening. Polls a lightweight status endpoint rather than using Redux -
 * this is a self-contained, frequently-refreshed widget with nothing else
 * in the app needing the same data.
 */
export const QueueStatusIndicator = () => {
  const [status, setStatus] = useState<QueueStatusResponse | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [triggering, setTriggering] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await fetchJson(`${API_URL}/content/queue-status`);
      const result = parseResponseBody(data, QueueStatusResponse);
      if (result.data) {
        setStatus(result.data);
        setNow(Date.now());
      }
    } catch {
      // Best-effort status widget - a failed poll just leaves the last
      // known state on screen rather than erroring the whole nav bar.
    }
  }, []);

  // Was a 5s poll. Now a channel on the shared realtime stream - same
  // connection App.tsx uses for tasks, so this costs no extra socket. The
  // server dedupes identical snapshots, so an idle queue sends nothing at all
  // while still reflecting a change within a second rather than up to five.
  useEffect(
    () =>
      subscribeToChannel("queue-status", (data) => {
        setStatus(data);
        setNow(Date.now());
      }),
    []
  );

  const triggerScan = useCallback(async () => {
    setTriggering(true);
    setScanError(null);
    try {
      await fetchJson(`${API_URL}/content/check-new-content`, { method: "POST" });
      // Refresh straight away rather than waiting out the poll interval, so
      // the button flips to "Scanning..." and the first queued requests
      // appear immediately rather than waiting for the next stream update.
      await poll();
    } catch (e) {
      setScanError(e instanceof Error ? e.message : "Failed to start scan");
    } finally {
      setTriggering(false);
    }
  }, [poll]);

  const isOpen = Boolean(anchorEl);
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const tick = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(tick);
  }, [isOpen]);

  if (!status) {
    return null;
  }

  const { dfQueue, scanInProgress, newContentCheckInProgress, signedInToDf } = status;
  const requests = dfQueue.requests;
  const isBackingOff = requests.some((request) => request.phase === "backing_off");
  const isActive = scanInProgress || newContentCheckInProgress || requests.length > 0;

  const scanDisabledReason = !signedInToDf
    ? "Not signed in to Digital Foundry - configure it in Settings"
    : newContentCheckInProgress
      ? "Already scanning for new content"
      : triggering
        ? "Starting..."
        : null;

  return (
    <>
      <Tooltip title="Digital Foundry request queue">
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} color="inherit">
          <Badge badgeContent={requests.length > 0 ? requests.length : undefined} color="secondary">
            {/* A continuous spin here would be running near-constantly
                during any scan (which can take a while) - distracting for
                something meant to sit passively in the nav bar. Active
                state is conveyed by color instead. */}
            <CloudSyncIcon fontSize="small" color={isBackingOff ? "warning" : isActive ? "primary" : "inherit"} />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={isOpen}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Box sx={{ padding: 2, minWidth: 320, maxWidth: 420 }}>
          <Typography variant="subtitle2">Digital Foundry Request Queue</Typography>
          <Typography variant="caption" color="text.secondary">
            Requests to digitalfoundry.net are sent one at a time, spaced out deliberately.
          </Typography>

          {requests.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ marginTop: 1.5 }}>
              Idle - no requests queued
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ marginTop: 1.5 }}>
              {requests.map((request) => {
                const phase = describePhase(request, now);
                return (
                  <Box key={request.id}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                        {request.label}
                      </Typography>
                      <Chip label={phase.text} size="small" color={phase.color} sx={{ flexShrink: 0 }} />
                    </Stack>
                    {request.bypassedQueue && (
                      <Typography variant="caption" color="text.secondary">
                        Sent immediately (skipped the queue)
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}

          <Divider sx={{ marginY: 1.5 }} />
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              {scanInProgress ? "Archive scan in progress" : "No archive scan running"}
            </Typography>
            <Tooltip title={scanDisabledReason || "Check the newest listing pages for content not yet in the library"}>
              {/* Span wrapper: a disabled MUI button doesn't emit the
                  pointer events a Tooltip needs, and the reason it's
                  disabled is exactly what's worth explaining. */}
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={Boolean(scanDisabledReason)}
                  onClick={triggerScan}
                  sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  {newContentCheckInProgress ? "Scanning..." : "Scan now"}
                </Button>
              </span>
            </Tooltip>
          </Stack>
          {scanError && (
            <Typography variant="caption" color="error.main" sx={{ display: "block", marginTop: 1 }}>
              {scanError}
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
};
