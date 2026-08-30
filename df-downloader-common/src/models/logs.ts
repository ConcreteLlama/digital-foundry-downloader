import { z } from "zod";
import { LogLevel } from "../config/logging-config.js";
import type { LogEntry } from "../utils/logger.js";

export const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: LogLevel,
  message: z.string(),
});

/**
 * Compile-time tie between the wire schema and the type the logger actually
 * produces, so the two can't drift apart silently.
 */
const _logEntrySchemaMatchesLogger: z.ZodType<LogEntry> = LogEntrySchema;
void _logEntrySchemaMatchesLogger;

/**
 * Query for GET /api/logs. Everything arrives as a string on the query string,
 * hence the coercion.
 */
export const LogsQuery = z.object({
  /** Comma-separated levels to include. Omitted means all of them. */
  levels: z.string().optional(),
  /** Case-insensitive substring match against the message. */
  search: z.string().optional(),
  /** Most entries to return. The newest are kept when there are more. */
  limit: z.coerce.number().int().min(1).max(5000).default(500),
  /**
   * Byte offset into the current log file to read from, as handed back by a
   * previous call's `nextCursor`. Omit for "give me the most recent entries";
   * pass it to fetch only what has been written since - which is what makes
   * the live tail cheap, since an idle service returns an empty array.
   */
  cursor: z.coerce.number().int().min(0).optional(),
  /**
   * The `fileId` that came back with `cursor`. Sent so the server can tell
   * "carry on from 20KB into the log" apart from "carry on from 20KB into a
   * log that has since been rotated away", which the offset alone cannot.
   */
  fileId: z.string().optional(),
});
export type LogsQuery = z.infer<typeof LogsQuery>;

export const LogsResponse = z.object({
  entries: LogEntrySchema.array(),
  /** Pass back as `cursor` to get only what is written after this point. */
  nextCursor: z.number(),
  /** Pass back as `fileId` alongside `cursor`; identifies which file that offset is into. */
  fileId: z.string(),
  /** False when file logging is switched off, so the UI can say so rather than looking broken. */
  fileLoggingEnabled: z.boolean(),
  /** More entries matched than `limit`; the oldest matches were dropped. */
  truncated: z.boolean(),
  /** Where the file lives, shown in the UI so it can be found on disk. */
  logFilePath: z.string(),
});
export type LogsResponse = z.infer<typeof LogsResponse>;
