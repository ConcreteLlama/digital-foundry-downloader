import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { LogEntry, LogLevel, LogsResponse, logLevels, parseResponseBody } from "df-downloader-common";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../../config";
import { monoFontFamily } from "../../themes/build-theme";
import { fetchJson } from "../../utils/fetch";
import { Loading } from "../general/loading.component";

/** How often the live tail asks for anything new. */
const POLL_INTERVAL_MS = 2000;

/** Most entries fetched in one go. */
const PAGE_LIMIT = 500;

/**
 * Most entries held in the browser at once.
 *
 * A live tail left running for an afternoon would otherwise accumulate without
 * limit, and the list is rendered in full rather than virtualised. Oldest are
 * dropped, which is the right end to lose - the reason the tail is running is
 * to watch what happens next.
 */
const MAX_BUFFERED_ENTRIES = 1500;

/** How close to the bottom still counts as "following the tail", in pixels. */
const STICK_TO_BOTTOM_THRESHOLD_PX = 40;

type LevelStyle = { color: string; label: string };

const useLevelStyles = (): Record<LogLevel, LevelStyle> => {
  const theme = useTheme();
  return useMemo(
    () => ({
      error: { color: theme.palette.error.main, label: "Error" },
      warn: { color: theme.palette.warning.main, label: "Warn" },
      info: { color: theme.palette.info.main, label: "Info" },
      verbose: { color: theme.palette.success.main, label: "Verbose" },
      debug: { color: theme.palette.text.secondary, label: "Debug" },
      silly: { color: theme.palette.text.disabled, label: "Silly" },
    }),
    [theme]
  );
};

const buildLogsUrl = (levels: Set<LogLevel>, search: string, cursor?: number, fileId?: string) => {
  const params = new URLSearchParams();
  // Sending every level is the same as sending none, and the shorter URL keeps
  // the common case readable in the network tab.
  if (levels.size && levels.size < logLevels.length) {
    params.set("levels", [...levels].join(","));
  }
  if (search.trim()) {
    params.set("search", search.trim());
  }
  params.set("limit", String(PAGE_LIMIT));
  if (cursor !== undefined) {
    params.set("cursor", String(cursor));
    if (fileId) {
      params.set("fileId", fileId);
    }
  }
  return `${API_URL}/logs?${params.toString()}`;
};

const fetchLogs = async (
  levels: Set<LogLevel>,
  search: string,
  cursor?: number,
  fileId?: string
): Promise<LogsResponse> => {
  const body = await fetchJson(buildLogsUrl(levels, search, cursor, fileId));
  const { data, error } = parseResponseBody(body, LogsResponse);
  if (error || !data) {
    throw new Error(error?.message || "Malformed response from the logs endpoint");
  }
  return data;
};

/**
 * Reads back the service's log file.
 *
 * Polls with a byte cursor rather than opening a stream. The app already has
 * an SSE channel, but it is one shared connection carrying app-wide state to
 * every open tab, and log traffic has no business on it - it would push log
 * data at tabs nobody is using to look at logs. A poll that only runs while
 * this page is mounted, and that returns an empty array when nothing has been
 * written, costs less and is far less to get wrong.
 */
export const LogsView = () => {
  const levelStyles = useLevelStyles();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  // Empty means every level, matching how filter chips work elsewhere in the
  // app (see the platform filter on the comparison page): you start with
  // everything and select to narrow, rather than starting fully selected and
  // clicking to remove. The request simply omits the filter when this is
  // empty, so "none selected" and "all selected" reach the server the same.
  const [levels, setLevels] = useState<Set<LogLevel>>(() => new Set<LogLevel>());
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [live, setLive] = useState(true);
  /**
   * Set when the live stream cannot be used, which drops the view back to the
   * polling loop below. The stream is the better mechanism but it is not
   * worth losing the tail entirely if a proxy in front of the app eats
   * event-streams.
   */
  const [streamFailed, setStreamFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<LogsResponse, "fileLoggingEnabled" | "logFilePath" | "truncated"> | null>(
    null
  );

  const cursorRef = useRef<number | undefined>(undefined);
  const fileIdRef = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  // Typing a search term shouldn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /** Full reload: filters changed, or the user asked for a refresh. */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLogs(levels, search);
      setEntries(data.entries);
      cursorRef.current = data.nextCursor;
      fileIdRef.current = data.fileId;
      setMeta(data);
      setError(null);
      // A fresh load should always land on the newest entries.
      stickToBottomRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [levels, search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Live tail over its own event stream.
   *
   * Its own connection rather than a channel on the app's shared stream: that
   * one fans every channel out to every client, so log traffic would reach
   * tabs nobody is reading logs in. Here the connection *is* the
   * subscription - it exists only while this page is mounted with live on,
   * and the server produces nothing when no one is listening.
   *
   * Entries arrive unfiltered and are filtered here, because this is a
   * trickle of new lines rather than a whole file. The initial load is still
   * filtered server-side, where it matters.
   */
  useEffect(() => {
    if (!live || streamFailed) {
      return;
    }
    const source = new EventSource(`${API_URL}/logs/stream`, { withCredentials: true });

    const onLogs = (event: MessageEvent) => {
      let incoming: LogEntry[];
      try {
        incoming = JSON.parse(event.data)?.data?.entries ?? [];
      } catch (e) {
        return;
      }
      const needle = search.trim().toLowerCase();
      const matching = incoming.filter(
        (entry) =>
          (levels.size === 0 || levels.has(entry.level)) &&
          (!needle || entry.message.toLowerCase().includes(needle))
      );
      if (!matching.length) {
        return;
      }
      setEntries((current) => {
        const next = [...current, ...matching];
        return next.length > MAX_BUFFERED_ENTRIES ? next.slice(-MAX_BUFFERED_ENTRIES) : next;
      });
      setError(null);
    };

    source.addEventListener("logs", onLogs as EventListener);
    // EventSource retries by itself, so a single error is not fatal - only a
    // connection that has actually been closed means falling back.
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        setStreamFailed(true);
      }
    };

    return () => {
      source.removeEventListener("logs", onLogs as EventListener);
      source.close();
    };
  }, [live, streamFailed, levels, search]);

  // Fallback only - see streamFailed. Reloads first, so entries the stream
  // already appended are not fetched a second time from a stale cursor.
  useEffect(() => {
    if (!live || !streamFailed) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cursorRef.current === undefined) {
        return;
      }
      try {
        const data = await fetchLogs(levels, search, cursorRef.current, fileIdRef.current);
        if (cancelled) {
          return;
        }
        cursorRef.current = data.nextCursor;
        fileIdRef.current = data.fileId;
        setMeta(data);
        setError(null);
        if (!data.entries.length) {
          return;
        }
        // Always appended, never replaced. Whatever comes back is by
        // definition unseen: normally it is the bytes after our cursor, and
        // when the log has rotated the server restarts us at the top of the
        // new file, which we have not read either.
        setEntries((current) => {
          const next = [...current, ...data.entries];
          return next.length > MAX_BUFFERED_ENTRIES ? next.slice(-MAX_BUFFERED_ENTRIES) : next;
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to tail logs");
        }
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live, streamFailed, levels, search]);

  /**
   * Follow the tail, but only while the user is actually at the bottom -
   * yanking the view back down while they are reading something further up is
   * the classic way for a log viewer to become unusable.
   */
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_THRESHOLD_PX;
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const toggleLevel = (level: LogLevel) => {
    setLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      // Deselecting the last one is allowed, because empty means all rather
      // than none - there is no state here that shows an empty page.
      return next;
    });
  };

  return (
    <Paper sx={{ padding: 2, display: "flex", flexDirection: "column" }}>
      <Typography variant="h5">Logs</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {meta?.logFilePath ? `Read from ${meta.logFilePath}` : "The log file written by the service."}
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
        {logLevels.map((level) => {
          const selected = levels.has(level);
          return (
            <Chip
              key={level}
              label={levelStyles[level].label}
              size="small"
              variant={selected ? "filled" : "outlined"}
              onClick={() => toggleLevel(level)}
              sx={{
                borderColor: levelStyles[level].color,
                color: selected ? undefined : levelStyles[level].color,
                backgroundColor: selected ? levelStyles[level].color : undefined,
                fontWeight: 600,
              }}
            />
          );
        })}
        {/* Says what no selection means, so an all-outlined row does not read
            as "nothing is being shown". */}
        {levels.size === 0 && (
          <Typography variant="caption" color="text.disabled">
            all levels
          </Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Search"
          placeholder="Filter by message text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 220 }}
        />
        <FormControlLabel
          control={<Switch checked={live} onChange={(e) => setLive(e.target.checked)} />}
          label="Live"
        />
        <Tooltip title="Reload from the start of the log">
          <span>
            <Button startIcon={<RefreshIcon />} onClick={() => void reload()} disabled={loading}>
              Refresh
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {meta && !meta.fileLoggingEnabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          File logging is turned off, so nothing new is being recorded. Anything below was written before it was
          disabled. Turn it back on in Settings &rarr; Logging.
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {meta?.truncated && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Showing the most recent matches only - there are older entries that match as well.
        </Alert>
      )}

      <Box
        ref={scrollRef}
        onScroll={onScroll}
        sx={{
          // A definite height, not flexGrow, and deliberately so. This page
          // renders inside NavPage, which is content-height - so "fill the
          // space" has no space to resolve against, and the pane simply grew
          // to fit every entry. That made the whole page the scroller, which
          // meant the log had no scrollport of its own and following the tail
          // could not work at all. Sizing against the viewport keeps the
          // scrolling where it belongs without imposing a height constraint
          // on the shared layout that the other pages in this section would
          // also have to satisfy.
          height: "60dvh",
          minHeight: 240,
          overflowY: "auto",
          overflowX: "auto",
          backgroundColor: "background.default",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          padding: 1,
          fontFamily: monoFontFamily,
          fontSize: "0.8rem",
        }}
      >
        {loading && !entries.length ? (
          <Loading />
        ) : entries.length ? (
          entries.map((entry, index) => (
            <LogRow key={`${entry.timestamp}-${index}`} entry={entry} style={levelStyles[entry.level]} />
          ))
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "inherit" }}>
            Nothing matches those filters.
          </Typography>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
        {live ? " - following the log" : ""}
      </Typography>
    </Paper>
  );
};

/**
 * One entry. Multi-line messages (stack traces, mostly) keep their line breaks
 * and indentation, which is the entire reason they are worth having in here.
 */
const LogRow = ({ entry, style }: { entry: LogEntry; style: LevelStyle }) => (
  <Box
    sx={{
      display: "flex",
      gap: 1,
      alignItems: "flex-start",
      paddingY: "1px",
      "&:hover": { backgroundColor: "action.hover" },
    }}
  >
    <Box component="span" sx={{ color: "text.disabled", whiteSpace: "nowrap" }}>
      {entry.timestamp.replace("T", " ").replace("Z", "")}
    </Box>
    <Box component="span" sx={{ color: style.color, fontWeight: 700, whiteSpace: "nowrap", minWidth: "4.5em" }}>
      {entry.level.toUpperCase()}
    </Box>
    <Box component="span" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", flexGrow: 1 }}>
      {entry.message}
    </Box>
  </Box>
);
