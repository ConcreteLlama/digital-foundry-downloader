import { z } from "zod";
import { logLevels } from "../utils/logger.js";

export const LogLevel = z.enum(logLevels);
export type LogLevel = z.infer<typeof LogLevel>;

export const LoggingConfig = z.object({
  /** The minimum log level to log */
  logLevel: LogLevel,
});
export type LoggingConfig = z.infer<typeof LoggingConfig>;
export const LoggingConfigKey = "logging";

export const DefaultLoggingConfig: LoggingConfig = {
  logLevel: "info",
};