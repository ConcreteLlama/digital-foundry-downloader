import { z } from "zod";

export const LogLevel = z.enum(["ERROR", "WARN", "INFO", "VERBOSE", "DEBUG", "SILLY"]);
export type LogLevel = z.infer<typeof LogLevel>;

export const LoggingConfig = z.object({
  logLevel: LogLevel,
});
export type LoggingConfig = z.infer<typeof LoggingConfig>;
export const LoggingConfigKey = "logging";
