export const logLevels = ["error", "warn", "info", "verbose", "debug", "silly"] as const;
export type LogLevel = (typeof logLevels)[number];

const logLevelValues = logLevels.reduce((acc: { [K in LogLevel]: number }, level, index) => {
  acc[level] = index;
  return acc;
}, {} as { [K in LogLevel]: number });

export class Logger {
  constructor(public level: LogLevel) {}

  isLoggable(level: LogLevel) {
    return logLevelValues[level] <= logLevelValues[this.level];
  }

  log(level: LogLevel, ...toLog: any[]) {
    if (!this.isLoggable(level)) {
      return;
    }
    let llString;
    let logFn = console.log;
    if (level === "warn") {
      llString = "WARNING";
      level = "warn";
      logFn = console.warn;
    } else if (level === "error") {
      llString = "ERROR";
      logFn = console.error;
    }
    logFn(`[${new Date().toISOString()}]${llString ? ` ${llString}` : ""}`, ...toLog);
  }
}

export const logger = new Logger("info");

export const loggerFn = (level: LogLevel, ...toLog: any[]) => logger.log(level, ...toLog);
