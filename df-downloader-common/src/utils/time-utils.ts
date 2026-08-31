export const stringToDuration = (timeString: string) => {
  //TODO: This is so basic and only works for HH:MM:SS
  const HHMMSS = timeString.split(":");
  let [hours, mins, secs] = HHMMSS.map((val) => parseInt(val));
  if (isNaN(hours) || isNaN(mins) || isNaN(secs)) {
    throw new Error(`Could not parse time ${timeString}`);
  }
  return secs + mins * 60 + hours * 60 * 60;
};

export const secondsToHMS = (durationSeconds: number) => {
  // 🤦‍♂️
  const seconds = durationSeconds % 60;
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const hours = Math.floor(durationSeconds / (60 * 60));
  return {
    hours,
    minutes,
    seconds,
  };
};

export const secondsToHHMMSS = (durationSeconds: number) => {
  // 🤦‍♂️
  // TODO: Make this less stupid, more versatile, maybe just use a library
  const { hours, minutes, seconds } = secondsToHMS(durationSeconds);
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};

/**
 * Durations in configuration are stored in milliseconds, because that is what
 * every timer in the service wants. Nobody thinks in them, though, so these
 * translate at the edges: the value on disk stays a number of milliseconds,
 * and the UI shows and accepts "12h".
 */
const DURATION_UNITS: [suffix: string, ms: number][] = [
  ["w", 7 * 24 * 60 * 60 * 1000],
  ["d", 24 * 60 * 60 * 1000],
  ["h", 60 * 60 * 1000],
  ["m", 60 * 1000],
  ["s", 1000],
  ["ms", 1],
];

/**
 * Milliseconds as the shortest thing a person would actually say.
 *
 * Every non-zero part, largest first: "12h", "1d", "1h 30m", and "1h 1m 1s"
 * for a value that genuinely is that.
 *
 * An earlier version capped this at two parts, on the grounds that nobody
 * sets a poll to 1h 30m 20s deliberately. That was wrong in a way that
 * matters here: this text is what a settings field shows for a stored value,
 * so a truncated rendering states a value the config does not hold, and
 * anything that re-commits the displayed text writes the truncation back.
 * Exactness beats brevity when the string has to survive a round trip.
 */
export const formatDurationMs = (ms: number): string => {
  if (!Number.isFinite(ms)) {
    return String(ms);
  }
  if (ms === 0) {
    return "0s";
  }
  const negative = ms < 0;
  let remaining = Math.abs(ms);
  const parts: string[] = [];
  for (const [suffix, size] of DURATION_UNITS) {
    if (remaining < size) {
      continue;
    }
    const count = Math.floor(remaining / size);
    remaining -= count * size;
    parts.push(`${count}${suffix}`);
  }
  // Sub-millisecond fractions have nowhere to go; better to say 0s than "".
  return `${negative ? "-" : ""}${parts.join(" ") || "0s"}`;
};

/**
 * "12h", "1d 6h", "90s", "1.5h" or a bare number of milliseconds.
 *
 * Bare numbers are read as milliseconds so that anything already stored, or
 * pasted from the old fields, still means what it did. Returns undefined
 * rather than throwing or guessing at nonsense, so a caller can leave a
 * half-typed value alone instead of rewriting it under the cursor.
 */
export const parseDurationMs = (input: string): number | undefined => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }
  // "ms" before the single-letter units, or "5ms" parses as 5 minutes.
  const token = /(\d+(?:\.\d+)?)\s*(ms|w|d|h|m|s)/g;
  // Rejected outright if anything survives removing the unit tokens: using
  // only the half that parsed would silently turn a typo into a real value.
  if (trimmed.replace(token, "").trim().length > 0) {
    return undefined;
  }
  let total = 0;
  let matched = 0;
  let match: RegExpExecArray | null;
  token.lastIndex = 0;
  while ((match = token.exec(trimmed)) !== null) {
    const suffix = match[2];
    const size = DURATION_UNITS.find(([candidate]) => candidate === suffix)?.[1];
    if (size === undefined) {
      return undefined;
    }
    total += Number(match[1]) * size;
    matched++;
  }
  return matched ? Math.round(total) : undefined;
};
