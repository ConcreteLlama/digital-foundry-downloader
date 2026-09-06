import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import StopIcon from "@mui/icons-material/Stop";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";
import { monoFontFamily } from "../../themes/build-theme";

type TranscodeStream = {
  id: string;
  file: string;
  startedAtIso: string;
  startSeconds: number;
  idleSeconds: number;
  video: "copy" | "encode";
  audio: "copy" | "encode";
};

const listStreams = async (): Promise<TranscodeStream[]> => {
  const body = await fetchJson(`${API_URL}/playback/streams`);
  return (body?.data?.streams ?? []) as TranscodeStream[];
};

const stopStream = async (id: string) => {
  await fetchJson(`${API_URL}/playback/streams/${encodeURIComponent(id)}/stop`, { method: "POST" });
};

const relative = (seconds: number) => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
};

/**
 * What is being re-encoded for playback right now.
 *
 * These are processes rather than tasks, so they appear nowhere else - not on
 * the Activity page, not in the queue - and until this existed the only
 * evidence they were running at all was playback being refused with "the
 * machine is busy". A viewer whose own abandoned stream was holding the slot
 * had no way to see that, and no way out but restarting the service.
 *
 * So this is as much a debugging view as a control: it shows the file, when
 * it started, how long since anything was read from it, and whether the video
 * is being copied or genuinely re-encoded - which together answer both "why
 * can I not play this" and "is this costing me a core".
 */
export const ActiveStreamsView = () => {
  const [streams, setStreams] = useState<TranscodeStream[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStreams(await listStreams());
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the active streams");
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Polled rather than pushed: these change on their own as viewers come and
    // go, and a stale list here is worse than useless - it is the thing you
    // came to check.
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const stop = async (id: string) => {
    setBusy(true);
    try {
      await stopStream(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not stop that stream");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2} sx={{ padding: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Active playback streams
        </Typography>
        <IconButton size="small" aria-label="Refresh" onClick={() => void refresh()}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Videos being re-encoded as someone watches them, because the browser cannot play the file as it stands. Each one
        is a running process, so they are not tasks and appear nowhere else. They stop on their own when the viewer
        leaves, and after five minutes of nothing being read from them - stop one here if playback is being refused and
        you know nobody is watching.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {streams?.length === 0 && (
        <Typography variant="body2" color="text.disabled">
          Nothing is being re-encoded.
        </Typography>
      )}
      {streams?.map((stream) => (
        <Box key={stream.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1, padding: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <Stack spacing={0.5} sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: monoFontFamily, fontSize: "0.75rem", wordBreak: "break-all" }}>
                {stream.file}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                <Chip size="small" label={`from ${stream.startSeconds}s`} />
                <Chip size="small" label={`video ${stream.video}`} color={stream.video === "encode" ? "warning" : "default"} />
                <Chip size="small" label={`audio ${stream.audio}`} color={stream.audio === "encode" ? "warning" : "default"} />
                {/* The number that answers "is anyone actually watching this" -
                    nothing has been read from an abandoned stream, and it is
                    what the automatic cleanup goes on. */}
                <Tooltip title="Time since anything was last read from this stream. A viewer who is watching reads constantly; one who has gone reads nothing.">
                  <Chip
                    size="small"
                    label={`idle ${relative(stream.idleSeconds)}`}
                    color={stream.idleSeconds > 30 ? "warning" : "default"}
                  />
                </Tooltip>
              </Stack>
            </Stack>
            <Button
              size="small"
              color="warning"
              startIcon={<StopIcon />}
              disabled={busy}
              onClick={() => void stop(stream.id)}
            >
              Stop
            </Button>
          </Stack>
        </Box>
      ))}
    </Stack>
  );
};
