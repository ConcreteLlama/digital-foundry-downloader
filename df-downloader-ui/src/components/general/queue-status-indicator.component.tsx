import CloudSyncIcon from "@mui/icons-material/CloudSync";
import { Badge, Box, CircularProgress, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import { QueueStatusResponse, parseResponseBody } from "df-downloader-common";
import { useEffect, useState } from "react";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";

const POLL_INTERVAL_MS = 5000;

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

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchJson(`${API_URL}/content/queue-status`);
        const result = parseResponseBody(data, QueueStatusResponse);
        if (!cancelled && result.data) {
          setStatus(result.data);
        }
      } catch {
        // Best-effort status widget - a failed poll just leaves the last
        // known state on screen rather than erroring the whole nav bar.
      }
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!status) {
    return null;
  }

  const { dfQueue, scanInProgress } = status;
  const isBackingOff = Boolean(dfQueue.backingOffUntil && dfQueue.backingOffUntil > Date.now());
  const isActive = scanInProgress || dfQueue.queued > 0 || dfQueue.active > 0 || isBackingOff;
  const badgeCount = dfQueue.queued + dfQueue.active;

  return (
    <>
      <Tooltip title="Digital Foundry request queue">
        <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} color="inherit">
          <Badge badgeContent={badgeCount > 0 ? badgeCount : undefined} color="secondary">
            {isActive ? <CircularProgress size={20} color="inherit" /> : <CloudSyncIcon fontSize="small" />}
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Box sx={{ padding: 2, minWidth: 240 }}>
          <Typography variant="subtitle2" sx={{ marginBottom: 1 }}>
            Digital Foundry Request Queue
          </Typography>
          <Typography variant="body2">Queued requests: {dfQueue.queued}</Typography>
          <Typography variant="body2">Request in flight: {dfQueue.active > 0 ? "Yes" : "No"}</Typography>
          {isBackingOff && (
            <Typography variant="body2" color="warning.main">
              Rate limited - backing off for {Math.max(0, Math.round((dfQueue.backingOffUntil! - Date.now()) / 1000))}s
            </Typography>
          )}
          <Typography variant="body2">Archive scan in progress: {scanInProgress ? "Yes" : "No"}</Typography>
          {!isActive && (
            <Typography variant="body2" color="text.secondary" sx={{ marginTop: 1 }}>
              Idle - nothing queued
            </Typography>
          )}
        </Box>
      </Popover>
    </>
  );
};
