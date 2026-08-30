import { z } from "zod";
import { logLevels } from "../utils/logger.js";

export const LogLevel = z.enum(logLevels);
export type LogLevel = z.infer<typeof LogLevel>;

/** Fixed name of the current log file, written into the work directory. */
export const LOG_FILE_NAME = "df-downloader.log";

export const FileLoggingConfig = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe(
      "Keep a copy of the log in a file, so you can look back at what happened without having to have been watching the console at the time. This is what the Logs page reads."
    ),
  logLevel: LogLevel.default("info").describe(
    "How much detail goes into the log file. This is separate from the console level, so you can keep the file detailed for later reading while the console stays quiet."
  ),
  maxFileSizeMb: z
    .number()
    .min(1)
    .max(1024)
    .default(10)
    .describe("How large the log file is allowed to get before it is set aside and a fresh one started."),
  maxFiles: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(3)
    .describe(
      "How many log files to keep in total, including the current one. The oldest is deleted when a new one is started, so the log can never use more than this many times the size limit above."
    ),
});
export type FileLoggingConfig = z.infer<typeof FileLoggingConfig>;

export const DefaultFileLoggingConfig: FileLoggingConfig = {
  enabled: true,
  logLevel: "info",
  maxFileSizeMb: 10,
  maxFiles: 3,
};

export const LoggingConfig = z.object({
  /** The minimum log level to log */
  logLevel: LogLevel.describe(
    "How much detail the service writes to its log. Raise it to debug while investigating a problem, and put it back afterwards - debug logging is noisy."
  ),
  /** File logging - what the Logs page reads. */
  file: FileLoggingConfig.default(DefaultFileLoggingConfig),
});
export type LoggingConfig = z.infer<typeof LoggingConfig>;
export const LoggingConfigKey = "logging";

export const DefaultLoggingConfig: LoggingConfig = {
  logLevel: "info",
  file: DefaultFileLoggingConfig,
};
