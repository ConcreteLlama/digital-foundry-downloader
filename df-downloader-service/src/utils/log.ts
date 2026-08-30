import { LogLevel, loggerFn } from "df-downloader-common";

export type LoggerType = (level: LogLevel, ...message: any[]) => void;

/**
 * Builds a prefixed logger for one component (a task, an FSM, a pipeline run).
 *
 * The prefix is how a line is traced back to the specific download or pipeline
 * execution that emitted it, which is most of the value of these logs when
 * several are running at once.
 *
 * Unprefixed calls default to the shared logger rather than `console.log`.
 * That matters more than it looks: the whole download/FSM/task/pipeline
 * subsystem logs through here and nothing passes a logger in, so previously
 * all of it went straight to the console - bypassing the configured log level
 * (the FSM logs every state transition at "verbose", and printed them
 * regardless) and never reaching any sink, which would have left the log file
 * missing exactly the detail it exists to capture.
 */
export const makeLogger = (prefix: string, logger: LoggerType = loggerFn): LoggerType => {
  const prefixStr = `[${prefix}]`;
  return (level, ...message) => logger(level, prefixStr, ...message);
};
