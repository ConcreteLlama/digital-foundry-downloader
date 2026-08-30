import { LogEntry, LogLevel } from "df-downloader-common";
import fs from "node:fs";

/**
 * Most bytes to pull off disk to satisfy one request.
 *
 * The limit is in entries, but the filtering happens after parsing, so a
 * narrow search over a large log could otherwise read the whole thing (up to
 * maxFiles * maxFileSize, which the user can set to a gigabyte) into memory
 * looking for matches. This caps that; a search that hits the cap reports
 * itself truncated rather than silently claiming there is nothing older.
 */
const MAX_READ_BYTES = 8 * 1024 * 1024;

export type ReadLogsOpts = {
  /** Levels to include. Undefined or empty means all of them. */
  levels?: LogLevel[];
  /** Case-insensitive substring match on the message. */
  search?: string;
  limit: number;
  /** Byte offset into the current file; see LogsQuery.cursor. */
  cursor?: number;
  /**
   * The identity the current file had when `cursor` was issued. A mismatch
   * means the cursor points into a file that no longer exists.
   */
  fileId?: string;
};

export type ReadLogsResult = {
  entries: LogEntry[];
  nextCursor: number;
  /** Pair this with `nextCursor` - together they identify a position in a specific file. */
  fileId: string;
  /** The cursor referred to a file that is gone; these entries start a new file. */
  rotated: boolean;
  truncated: boolean;
};

const fileSize = (filePath: string) => {
  try {
    return fs.statSync(filePath).size;
  } catch (e) {
    return 0;
  }
};

/**
 * A token that changes when the log file is replaced.
 *
 * A byte offset alone cannot tell "20KB into the current log" apart from "20KB
 * into a log that has since been rotated away and replaced". Comparing the
 * offset against the file size catches that only when the new file is shorter
 * than the old offset - so deleting the log, or rotating it, and then writing
 * past the old offset before the next poll would have the reader serve a slice
 * of the new file as though it were a continuation of the old one.
 *
 * Creation time plus inode covers both the rotation and the somebody-deleted-it
 * cases. Where a filesystem reports neither usefully this degrades to a
 * constant, which is exactly the size-comparison behaviour it replaces.
 */
const fileIdentity = (filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    return `${stats.ino}-${Math.round(stats.birthtimeMs)}`;
  } catch (e) {
    return "";
  }
};

/** Reads [start, end) of a file, tolerating the file having gone away. */
const readRange = (filePath: string, start: number, end: number): string => {
  const length = end - start;
  if (length <= 0) {
    return "";
  }
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, start);
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } catch (e) {
    return "";
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (e) {
        /* already gone */
      }
    }
  }
};

/**
 * Turns a chunk of the log file into entries.
 *
 * Unparseable lines are dropped rather than reported. That is the point: a
 * chunk that starts mid-file almost always begins with the tail of a line,
 * and skipping it is exactly the right handling. It also means a torn final
 * line - the only way a partial line can exist, since entries are appended
 * whole - costs one entry instead of failing the request.
 */
const parseChunk = (chunk: string): LogEntry[] => {
  const entries: LogEntry[] = [];
  for (const line of chunk.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed.message === "string" && typeof parsed.level === "string") {
        entries.push(parsed as LogEntry);
      }
    } catch (e) {
      /* partial or corrupt line */
    }
  }
  return entries;
};

const makeMatcher = ({ levels, search }: ReadLogsOpts) => {
  const levelSet = levels?.length ? new Set(levels) : null;
  const needle = search?.trim().toLowerCase();
  return (entry: LogEntry) => {
    if (levelSet && !levelSet.has(entry.level)) {
      return false;
    }
    if (needle && !entry.message.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  };
};

/**
 * Reads log entries, oldest first.
 *
 * Two modes. With a cursor, it returns only what has been appended since that
 * offset - the live tail, which costs nothing when nothing has been logged.
 * Without one, it walks backwards from the end of the current file and on
 * through the rotated ones until it has `limit` matches or runs out of budget,
 * so a filter that matches nothing recent still finds older matches instead of
 * showing an empty page.
 */
export const readLogEntries = (filePaths: string[], opts: ReadLogsOpts): ReadLogsResult => {
  const [currentPath, ...rotatedPaths] = filePaths;
  const currentSize = fileSize(currentPath);
  const currentFileId = fileIdentity(currentPath);
  const matches = makeMatcher(opts);

  if (opts.cursor !== undefined) {
    // Either the file is not the one the cursor was issued against, or the
    // cursor is past its end - both mean it was rotated, truncated or deleted
    // since the client last looked. Start again from the top of the new one.
    const rotated = opts.cursor > currentSize || (opts.fileId !== undefined && opts.fileId !== currentFileId);
    const from = rotated ? 0 : opts.cursor;
    const start = Math.max(from, currentSize - MAX_READ_BYTES);
    const entries = parseChunk(readRange(currentPath, start, currentSize)).filter(matches);
    const truncated = entries.length > opts.limit || start > from;
    return {
      entries: entries.slice(-opts.limit),
      nextCursor: currentSize,
      fileId: currentFileId,
      rotated,
      truncated,
    };
  }

  const collected: LogEntry[] = [];
  let budget = MAX_READ_BYTES;
  let exhausted = false;
  for (const filePath of [currentPath, ...rotatedPaths]) {
    if (collected.length >= opts.limit || budget <= 0) {
      exhausted = true;
      break;
    }
    const size = fileSize(filePath);
    if (!size) {
      continue;
    }
    const start = Math.max(0, size - budget);
    if (start > 0) {
      exhausted = true;
    }
    budget -= size - start;
    // Files are visited newest first but each chunk is in file order, so the
    // older file's entries go in front of what we already have.
    collected.unshift(...parseChunk(readRange(filePath, start, size)).filter(matches));
  }

  return {
    entries: collected.slice(-opts.limit),
    nextCursor: currentSize,
    fileId: currentFileId,
    rotated: false,
    truncated: collected.length > opts.limit || exhausted,
  };
};
