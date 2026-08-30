import { LogEntry, LogLevel, LogSink } from "df-downloader-common";
import fs from "node:fs";
import path from "node:path";

export const FILE_LOG_SINK_NAME = "file";

/**
 * How long entries may sit in memory before being written.
 *
 * Writing each line as it happens would mean a syscall per log line, and a
 * full archive scan produces thousands in a burst. Batching bounds that to a
 * handful of writes a second while keeping the file close enough to live for
 * the Logs page to feel immediate - and the page flushes before reading
 * anyway (see flush()), so the delay is never actually observed there.
 */
const FLUSH_INTERVAL_MS = 250;

/**
 * Flush early if this many entries pile up, so a burst can't balloon memory
 * or turn into one enormous write.
 */
const MAX_PENDING_ENTRIES = 1000;

/**
 * Appends log entries to a size-capped, rotated file as JSON Lines.
 *
 * JSON rather than formatted text because stack traces are multi-line: a
 * plain-text log can't be split back into entries without guessing where one
 * ends, whereas one JSON object per line survives embedded newlines exactly.
 *
 * Nothing holds the file open between flushes. That costs an open/close per
 * batch, which at this rate is irrelevant, and buys two things worth more:
 * rotation is a plain rename that can't fail because a handle is still on the
 * file (Windows refuses those), and an externally deleted or moved log file
 * simply reappears on the next write rather than leaving the sink writing
 * into a handle nobody can see.
 */
export class FileLogSink implements LogSink {
  readonly name = FILE_LOG_SINK_NAME;

  private pending: LogEntry[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private currentSizeBytes = 0;
  /**
   * Set after a write fails, to stop a broken destination (a full disk, a
   * work dir that vanished) from producing an error per log line forever.
   * Cleared by a successful write.
   */
  private reportedWriteFailure = false;

  constructor(
    public level: LogLevel,
    /** Directory the log lives in - the work dir. */
    private readonly dir: string,
    private readonly fileName: string,
    private readonly maxFileSizeBytes: number,
    private readonly maxFiles: number
  ) {
    this.currentSizeBytes = this.statSize(this.filePath);
  }

  get filePath() {
    return path.join(this.dir, this.fileName);
  }

  /** Current file first, then rotated files newest to oldest. */
  get allFilePaths() {
    const paths = [this.filePath];
    for (let i = 1; i < this.maxFiles; i++) {
      paths.push(`${this.filePath}.${i}`);
    }
    return paths;
  }

  private statSize(filePath: string) {
    try {
      return fs.statSync(filePath).size;
    } catch (e) {
      return 0;
    }
  }

  write(entry: LogEntry) {
    this.pending.push(entry);
    if (this.pending.length >= MAX_PENDING_ENTRIES) {
      this.flush();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS);
      // An idle service should still be able to exit; a pending log flush is
      // not a reason to keep the event loop alive.
      this.flushTimer.unref?.();
    }
  }

  /**
   * Writes everything buffered, synchronously, rotating as needed part-way
   * through if the batch would take the file past its size cap.
   *
   * Synchronous on purpose: this also runs from the process 'exit' handler,
   * where async work would simply never happen, and it means a caller that
   * flushes before reading the file (the Logs endpoint) sees the result
   * immediately rather than racing it.
   */
  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.pending.length) {
      return;
    }
    const entries = this.pending;
    this.pending = [];
    const lines = entries.map((entry) => `${JSON.stringify(entry)}\n`);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      // Rotation is decided per line rather than per batch. Checking only
      // once at the end would let a single flush write far past the cap and
      // then rotate the whole oversized file away - with a burst of a
      // thousand entries and a small cap, that both breaks the limit the user
      // set and can discard the entire batch (there is nowhere to rotate to
      // when maxFiles is 1).
      let batch: string[] = [];
      let batchBytes = 0;
      const writeBatch = () => {
        if (!batch.length) {
          return;
        }
        fs.appendFileSync(this.filePath, batch.join(""), "utf-8");
        this.currentSizeBytes += batchBytes;
        batch = [];
        batchBytes = 0;
      };
      for (const line of lines) {
        const lineBytes = Buffer.byteLength(line, "utf-8");
        const pendingSize = this.currentSizeBytes + batchBytes;
        // The `pendingSize > 0` guard matters: an entry bigger than the whole
        // cap (a long stack trace against a small limit) would otherwise
        // rotate an empty file forever without ever writing. It gets written
        // on its own instead, overshooting by itself - a single line is the
        // one thing that cannot be split.
        if (pendingSize > 0 && pendingSize + lineBytes > this.maxFileSizeBytes) {
          writeBatch();
          this.rotate();
        }
        batch.push(line);
        batchBytes += lineBytes;
      }
      writeBatch();
      this.reportedWriteFailure = false;
    } catch (e) {
      // Deliberately console-only - routing this through the logger would
      // come straight back here and recurse.
      if (!this.reportedWriteFailure) {
        this.reportedWriteFailure = true;
        console.error(`[${new Date().toISOString()}] ERROR Failed writing to log file ${this.filePath}`, e);
      }
    }
  }

  /**
   * Shuffles the current file to `.1`, each `.n` to `.n+1`, and drops whatever
   * falls off the end, so total usage stays under maxFiles * maxFileSize.
   */
  private rotate() {
    try {
      // Delete the oldest first, so the rename into its slot has somewhere to
      // go - fs.renameSync overwrites on POSIX but throws on Windows.
      const oldest = `${this.filePath}.${this.maxFiles - 1}`;
      if (this.maxFiles > 1) {
        fs.rmSync(oldest, { force: true });
      }
      for (let i = this.maxFiles - 2; i >= 1; i--) {
        const from = `${this.filePath}.${i}`;
        if (fs.existsSync(from)) {
          fs.renameSync(from, `${this.filePath}.${i + 1}`);
        }
      }
      if (this.maxFiles > 1) {
        fs.renameSync(this.filePath, `${this.filePath}.1`);
      } else {
        // Keeping a single file means there is nowhere to rotate to, so the
        // cap can only be honoured by starting over.
        fs.rmSync(this.filePath, { force: true });
      }
      this.currentSizeBytes = 0;
    } catch (e) {
      console.error(`[${new Date().toISOString()}] ERROR Failed to rotate log file ${this.filePath}`, e);
      // Leave currentSizeBytes as it is: the next line will trip the check
      // again and retry, rather than the file growing unbounded unnoticed.
    }
  }
}
