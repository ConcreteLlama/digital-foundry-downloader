import { QueueStatusResponse, TasksResponse, logger, parseResponseBody } from "df-downloader-common";
import { API_URL } from "../../config";
import { fetchJson } from "../../utils/fetch";

/**
 * Consecutive stream errors tolerated before falling back to polling.
 *
 * EventSource retries on its own roughly every 3s, so this rides out a brief
 * blip (a service restart, a dropped packet) without abandoning the stream,
 * while still reaching the fallback in about ten seconds if the stream
 * genuinely can't be established - some proxies and corporate networks
 * mishandle text/event-stream, and silently never updating again would be a
 * far worse failure than polling.
 */
const FAILURES_BEFORE_FALLBACK = 3;

const STREAM_RETRY_MIN_MS = 30_000;
const STREAM_RETRY_MAX_MS = 5 * 60_000;

/**
 * Every push channel, with the REST endpoint and interval to fall back to if
 * the stream can't be held open. The intervals deliberately match what each
 * consumer polled at before the stream existed, so a client that can't stream
 * behaves exactly as it used to rather than degrading further.
 */
const CHANNELS = {
  tasks: {
    schema: TasksResponse,
    fallbackUrl: `${API_URL}/tasks/list`,
    fallbackIntervalMs: 1000,
  },
  "queue-status": {
    schema: QueueStatusResponse,
    fallbackUrl: `${API_URL}/content/queue-status`,
    fallbackIntervalMs: 5000,
  },
} as const;

export type ChannelName = keyof typeof CHANNELS;

export type ChannelData = {
  tasks: TasksResponse;
  "queue-status": QueueStatusResponse;
};

type Listener = (data: any) => void;

const listeners = new Map<ChannelName, Set<Listener>>();
const fallbackTimers = new Map<ChannelName, ReturnType<typeof setInterval>>();

let eventSource: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveErrors = 0;
let retryDelay = STREAM_RETRY_MIN_MS;
let fallbackActive = false;

const channelNames = () => Object.keys(CHANNELS) as ChannelName[];

const emit = (channel: ChannelName, data: unknown) => {
  listeners.get(channel)?.forEach((listener) => {
    try {
      listener(data);
    } catch (e) {
      logger.log("error", `Realtime listener for "${channel}" threw`, e);
    }
  });
};

const handleFrame = (channel: ChannelName, raw: string) => {
  try {
    const { data, error } = parseResponseBody(JSON.parse(raw), CHANNELS[channel].schema);
    if (error) {
      logger.log("error", `Realtime channel "${channel}" sent an error payload`, error);
      return;
    }
    emit(channel, data);
  } catch (e) {
    logger.log("error", `Failed to parse realtime payload for "${channel}"`, e);
  }
};

const pollOnce = async (channel: ChannelName) => {
  try {
    const body = await fetchJson(CHANNELS[channel].fallbackUrl);
    const { data, error } = parseResponseBody(body, CHANNELS[channel].schema);
    if (!error) {
      emit(channel, data);
    }
  } catch {
    // Best effort - a failed poll leaves the last known state on screen
    // rather than tearing anything down.
  }
};

const startFallbackFor = (channel: ChannelName) => {
  if (fallbackTimers.has(channel) || !listeners.get(channel)?.size) {
    return;
  }
  void pollOnce(channel);
  fallbackTimers.set(channel, setInterval(() => void pollOnce(channel), CHANNELS[channel].fallbackIntervalMs));
};

const startFallback = () => {
  if (fallbackActive) {
    return;
  }
  fallbackActive = true;
  logger.log("warn", "Realtime stream unavailable - falling back to polling");
  channelNames().forEach(startFallbackFor);
};

const stopFallback = () => {
  if (!fallbackActive) {
    return;
  }
  fallbackActive = false;
  logger.log("info", "Realtime stream recovered - stopping the polling fallback");
  fallbackTimers.forEach((timer) => clearInterval(timer));
  fallbackTimers.clear();
};

const scheduleStreamRetry = () => {
  if (retryTimer) {
    return;
  }
  // Polling keeps the UI correct meanwhile, so retries can be lazy - but they
  // do need to happen, otherwise one bad minute leaves the tab polling for the
  // rest of its life.
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryDelay = Math.min(retryDelay * 2, STREAM_RETRY_MAX_MS);
    openStream();
  }, retryDelay);
};

const openStream = () => {
  if (eventSource || !hasAnyListener()) {
    return;
  }
  const source = new EventSource(`${API_URL}/stream`, { withCredentials: true });
  eventSource = source;

  channelNames().forEach((channel) => {
    source.addEventListener(channel, (event) => {
      consecutiveErrors = 0;
      retryDelay = STREAM_RETRY_MIN_MS;
      // Proof the stream works, so the fallback is redundant - running both
      // would double every update.
      stopFallback();
      handleFrame(channel, (event as MessageEvent).data);
    });
  });

  source.onerror = () => {
    consecutiveErrors += 1;
    if (consecutiveErrors < FAILURES_BEFORE_FALLBACK) {
      // Let EventSource's own reconnect handle it - that's the main reason for
      // choosing SSE over a socket we'd have to babysit ourselves.
      return;
    }
    source.close();
    if (eventSource === source) {
      eventSource = null;
    }
    startFallback();
    scheduleStreamRetry();
  };
};

const hasAnyListener = () => channelNames().some((channel) => listeners.get(channel)?.size);

const teardown = () => {
  eventSource?.close();
  eventSource = null;
  stopFallback();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  consecutiveErrors = 0;
  retryDelay = STREAM_RETRY_MIN_MS;
};

/**
 * Subscribes to one channel of the shared realtime stream.
 *
 * Every subscriber shares a single EventSource - SSE multiplexes by event name,
 * so adding a channel costs no extra connection, auth round-trip or reconnect
 * handling, and the browser's ~6-connections-per-origin limit stays irrelevant.
 * The connection opens on the first subscriber and closes with the last.
 *
 * If the stream can't be held open, subscribers keep receiving data from the
 * REST fallback poll instead, transparently.
 *
 * Returns an unsubscribe function; call it on unmount.
 */
export const subscribeToChannel = <K extends ChannelName>(
  channel: K,
  listener: (data: ChannelData[K]) => void
) => {
  const set = listeners.get(channel) ?? new Set<Listener>();
  set.add(listener as Listener);
  listeners.set(channel, set);

  if (fallbackActive) {
    startFallbackFor(channel);
  } else {
    openStream();
  }

  return () => {
    set.delete(listener as Listener);
    if (!set.size) {
      const timer = fallbackTimers.get(channel);
      if (timer) {
        clearInterval(timer);
        fallbackTimers.delete(channel);
      }
    }
    if (!hasAnyListener()) {
      teardown();
    }
  };
};
