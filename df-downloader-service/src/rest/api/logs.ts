import { LogLevel, LogsQuery, LogsResponse, logLevels } from "df-downloader-common";
import express from "express";
import { flushFileLog, getLogFilePath, getLogFilePaths, isFileLoggingEnabled } from "../../utils/logging/file-logging.js";
import { readLogEntries } from "../../utils/logging/log-file-reader.js";
import { sendResponse, zodParseHttp } from "../utils/utils.js";

const allLevels = new Set<string>(logLevels);

/**
 * Unknown level names are dropped rather than rejected, so a stale bookmark or
 * a filter saved before a level was renamed still returns something useful
 * instead of a 400. An empty result means "no filter", matching an absent one.
 */
const parseLevels = (levels?: string): LogLevel[] | undefined => {
  if (!levels) {
    return undefined;
  }
  const parsed = levels
    .split(",")
    .map((level) => level.trim().toLowerCase())
    .filter((level): level is LogLevel => allLevels.has(level));
  return parsed.length ? parsed : undefined;
};

/**
 * Reads back the log file written by the file sink (see
 * utils/logging/file-log-sink.ts).
 *
 * Filtering happens here rather than in the browser because the file holds far
 * more than a page would ever show - sending the lot over so the client can
 * discard most of it would be the expensive way round.
 */
export const makeLogsRouter = () => {
  const router = express.Router();

  router.get("/", (req, res) =>
    zodParseHttp(
      LogsQuery,
      req,
      res,
      async (query) => {
        // Anything still buffered is part of "the log" as far as the caller is
        // concerned, so it has to reach disk before we read.
        flushFileLog();
        const { entries, nextCursor, fileId, truncated } = readLogEntries(getLogFilePaths(), {
          levels: parseLevels(query.levels),
          search: query.search,
          limit: query.limit,
          cursor: query.cursor,
          fileId: query.fileId,
        });
        // Built field by field rather than spread, so the reader is free to
        // return things that are its own business (it also reports whether the
        // file rotated, which the client does not need - the entries after a
        // rotation are ones it has not seen either way, so it appends them the
        // same as any other batch).
        const response: LogsResponse = {
          entries,
          nextCursor,
          fileId,
          truncated,
          fileLoggingEnabled: isFileLoggingEnabled(),
          logFilePath: getLogFilePath(),
        };
        return sendResponse(res, response);
      },
      "query"
    )
  );

  return router;
};
