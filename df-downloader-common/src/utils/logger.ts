export const logLevels = ["error", "warn", "info", "verbose", "debug", "silly"] as const;
export type LogLevel = (typeof logLevels)[number];

const logLevelValues = logLevels.reduce((acc: { [K in LogLevel]: number }, level, index) => {
  acc[level] = index;
  return acc;
}, {} as { [K in LogLevel]: number });

export const isLevelAtLeastAsSevereAs = (level: LogLevel, threshold: LogLevel) =>
  logLevelValues[level] <= logLevelValues[threshold];

/** One log line, as handed to a sink and as persisted/served to the Logs view. */
export type LogEntry = {
  /** ISO 8601, always UTC. */
  timestamp: string;
  level: LogLevel;
  /** The already-formatted message - every argument joined into one string. */
  message: string;
};

/**
 * Somewhere log entries go in addition to the console.
 *
 * This exists so the *service* can persist logs to a file without this module
 * having to know anything about files. `df-downloader-common` is imported by
 * the UI as well, so it has to stay browser-safe - a bare `import fs` here
 * would break the Vite build. The service registers its file sink at startup
 * (see utils/logging/file-log-sink.ts) and nothing else changes.
 */
export type LogSink = {
  /** Identifies the sink so it can be replaced when config changes. */
  name: string;
  /** The least severe level this sink wants. Independent of the console level. */
  level: LogLevel;
  write: (entry: LogEntry) => void;
};

/**
 * Renders one `logger.log()` argument the way `console.log` would, so what
 * lands in the log file matches what was on stdout.
 *
 * Errors are the case that matters: `JSON.stringify(new Error("x"))` is "{}",
 * which would turn every logged failure into a blank. The stack carries the
 * message, so it alone is enough.
 */
const formatLogArg = (arg: any): string => {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  if (arg === null) {
    return "null";
  }
  if (arg === undefined) {
    return "undefined";
  }
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch (e) {
      // Circular, or something that throws in toJSON. Not worth losing the
      // whole line over.
      return String(arg);
    }
  }
  return String(arg);
};

export const formatLogArgs = (args: any[]) => args.map(formatLogArg).join(" ");

export class Logger {
  /** Sinks by name, so re-registering under the same name replaces rather than duplicates. */
  private sinks = new Map<string, LogSink>();

  constructor(public level: LogLevel) {}

  isLoggable(level: LogLevel) {
    return isLevelAtLeastAsSevereAs(level, this.level);
  }

  /** Registers a sink, replacing any existing one with the same name. */
  addSink(sink: LogSink) {
    this.sinks.set(sink.name, sink);
  }

  removeSink(name: string) {
    this.sinks.delete(name);
  }

  getSink(name: string) {
    return this.sinks.get(name);
  }

  log(level: LogLevel, ...toLog: any[]) {
    const consoleWants = this.isLoggable(level);
    // A sink can ask for more detail than the console shows (writing debug to
    // the file while stdout stays at info is the main reason the two levels
    // are configured separately), so the early-out has to consider both.
    const sinksWanting =
      this.sinks.size === 0
        ? []
        : [...this.sinks.values()].filter((sink) => isLevelAtLeastAsSevereAs(level, sink.level));
    if (!consoleWants && !sinksWanting.length) {
      return;
    }
    const timestamp = new Date().toISOString();
    if (consoleWants) {
      let llString;
      let logFn = console.log;
      if (level === "warn") {
        llString = "WARNING";
        logFn = console.warn;
      } else if (level === "error") {
        llString = "ERROR";
        logFn = console.error;
      }
      logFn(`[${timestamp}]${llString ? ` ${llString}` : ""}`, ...toLog);
    }
    if (sinksWanting.length) {
      const entry: LogEntry = { timestamp, level, message: formatLogArgs(toLog) };
      for (const sink of sinksWanting) {
        try {
          sink.write(entry);
        } catch (e) {
          // A failing sink must never take down the thing that was logging.
          // Deliberately console-only: routing this back through log() would
          // recurse straight back into the sink that just threw.
          console.error(`[${timestamp}] ERROR Log sink "${sink.name}" threw`, e);
        }
      }
    }
  }
}

export const logger = new Logger("info");

export const loggerFn = (level: LogLevel, ...toLog: any[]) => logger.log(level, ...toLog);
