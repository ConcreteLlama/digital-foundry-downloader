import { LogEntry, LogLevel, LogsQuery, LogsResponse, logLevels } from "df-downloader-common";
import express from "express";
import {
  flushFileLog,
  getLogFilePath,
  getLogFilePaths,
  isFileLoggingEnabled,
  subscribeToLogEntries,
} from "../../utils/logging/file-logging.js";
import { readLogEntries } from "../../utils/logging/log-file-reader.js";
import { makeSuccessResponse } from "df-downloader-common";
import type { Request, Response } from "express";
import { sendResponse, zodParseHttp } from "../utils/utils.js";

/**
 * How long appended entries are gathered before being sent.
 *
 * A busy moment writes many lines in quick succession, and one SSE frame per
 * line would be mostly framing. This is short enough to still read as live.
 */
const BATCH_MS = 250;

/** Keeps proxies from closing an idle stream - same reason as the task stream. */
const HEARTBEAT_MS = 20000;

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

  /**
   * A live tail, as its own stream rather than a channel on the shared one.
   *
   * The shared broadcaster (rest/realtime/stream-broadcaster.ts) builds each
   * channel once and writes the identical frame to every connected client -
   * deliberately, so several open tabs do not multiply the work. That is the
   * wrong shape for logs twice over: every tab would receive log traffic
   * whether or not anyone was reading logs in it, and log entries are
   * appended rather than re-snapshotted, so there is no "current value" to
   * dedupe against.
   *
   * Here the connection is the subscription. The page opens it when the live
   * toggle is on and closes it on unmount, and nothing is produced at all
   * while nobody is watching.
   *
   * Entries go out unfiltered and the client applies its own level and search
   * filters. That is the opposite of the read endpoint above, and for the
   * opposite reason: this is a trickle of new lines, not a whole file, so
   * filtering per connection would cost more bookkeeping than it saves bytes.
   */
  router.get("/stream", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which makes a working
      // stream look hung. Ignored by everything else.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.socket?.setTimeout(0);
    res.socket?.setNoDelay(true);

    let batch: LogEntry[] = [];
    let batchTimer: NodeJS.Timeout | null = null;

    const send = () => {
      batchTimer = null;
      if (!batch.length) {
        return;
      }
      const entries = batch;
      batch = [];
      res.write(`event: logs\ndata: ${JSON.stringify(makeSuccessResponse({ entries }))}\n\n`);
    };

    const unsubscribe = subscribeToLogEntries((entry) => {
      batch.push(entry);
      if (!batchTimer) {
        batchTimer = setTimeout(send, BATCH_MS);
        batchTimer.unref?.();
      }
    });

    const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
    heartbeat.unref?.();

    req.on("close", () => {
      unsubscribe();
      clearInterval(heartbeat);
      if (batchTimer) {
        clearTimeout(batchTimer);
      }
    });
  });

  return router;
};
