const loggerTypeLevels = ["error", "warn", "info", "verbose", "debug", "silly"] as const;
type LoggerTypeLevel = (typeof loggerTypeLevels)[number];

export type LoggerType = (level: LoggerTypeLevel, ...message: any[]) => void;

const makeDefaultLogger = (prefix: string): LoggerType => {
  return (level, ...message) => {
    const levelPrefix = level === "error" ? "[ERROR]" : level === "warn" ? "[WARN]" : "";
    console.log(`${new Date().toISOString()} [${prefix}]${levelPrefix}`, ...message);
  };
};

export const makeLogger = (prefix: string, logger?: LoggerType): LoggerType => {
  if (logger) {
    const prefixStr = `[${prefix}]`;
    return (level, ...message) => logger(level, prefixStr, ...message);
  }
  return makeDefaultLogger(prefix);
};
