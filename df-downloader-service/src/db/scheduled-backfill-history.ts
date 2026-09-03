import { ScheduledBackfillEndReason, ScheduledBackfillWindowRecord, logger } from "df-downloader-common";
import path from "path";
import { z } from "zod";
import { ensureDirectory } from "../utils/file-utils.js";
import { FileDb } from "./file-db.js";

const CURRENT_DB_VERSION = "1.0.0";

const ScheduledBackfillHistorySchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  windows: ScheduledBackfillWindowRecord.array().default([]),
});
type ScheduledBackfillHistorySchema = z.infer<typeof ScheduledBackfillHistorySchema>;

/**
 * How many windows are kept.
 *
 * The view shows a handful and the question it answers - "did it actually do
 * anything last night" - goes stale within days. A month of nightly windows is
 * already more than anyone scrolls, and each row carries the content keys it
 * analysed, so an unbounded log would grow without limit for no reader.
 */
const MAX_WINDOWS = 30;

/**
 * What each scheduled window did, so the panel can answer "did it run".
 *
 * Its own small store rather than a section of the operational DB: the plan
 * leaves open whether this view eventually belongs on the Activity page
 * instead, and keeping it self-contained means moving it later is moving one
 * file rather than unpicking it from the content database.
 *
 * Deliberately not a task record. Completed tasks are cleared, so anything
 * built on them would empty itself out within a day or two - which is exactly
 * why rows link to the *content* they analysed rather than to its tasks.
 */
export class ScheduledBackfillHistory {
  static async create(dbDir: string) {
    ensureDirectory(dbDir);
    const filename = path.join(dbDir, "scheduled-backfill-history.json");
    const fileDb = await FileDb.create<ScheduledBackfillHistorySchema>({
      schema: ScheduledBackfillHistorySchema,
      filename,
      initialData: {
        version: CURRENT_DB_VERSION,
        lastUpdated: new Date(),
        windows: [],
      },
      backupDestination: async (data) => {
        const version = data?.version || "NO_VERSION";
        const backupDir = path.join(dbDir, "backups");
        ensureDirectory(backupDir);
        return path.join(backupDir, `scheduled-backfill-history-${version}-${Date.now()}.json`);
      },
      patchRoutine: async (data) => {
        // Nothing to patch yet - this is version 1. The chain lives here so
        // the next shape change adds a step rather than a migration script.
        if (data.version !== CURRENT_DB_VERSION) {
          data.version = CURRENT_DB_VERSION;
          return { data, patched: true };
        }
        return { data, patched: false };
      },
    });
    return new ScheduledBackfillHistory(fileDb);
  }

  private constructor(private readonly fileDb: FileDb<ScheduledBackfillHistorySchema>) {}

  private get data() {
    return this.fileDb.getData();
  }

  private save() {
    this.data.lastUpdated = new Date();
    this.fileDb.scheduleUpdateDb(this.data);
  }

  /** Newest first, which is the order the panel shows them in. */
  list(): ScheduledBackfillWindowRecord[] {
    return [...this.data.windows].sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
  }

  /**
   * The window still marked open, if there is one.
   *
   * Used on startup: a service that stopped mid-window left a row with no
   * outcome, and leaving it that way would make the next window's row look
   * like a continuation of it.
   */
  openWindow(): ScheduledBackfillWindowRecord | undefined {
    return this.data.windows.find((window) => !window.endedAt);
  }

  /**
   * Starts a window, or picks the same one back up.
   *
   * `id` is the window's opening instant, so it identifies the window rather
   * than the run. Restarting the service mid-window used to append a second row
   * with the same id - the first closed as "interrupted" with nothing against
   * it, the second carrying the real count - so one night showed as two
   * windows, which is exactly what an overnight container update produces.
   *
   * Resuming keeps the counts and the fed items, so a window that survived a
   * restart reads as one window that did the work of both halves.
   */
  open(record: Omit<ScheduledBackfillWindowRecord, "analysed" | "failed" | "items">) {
    const existing = this.data.windows.find((window) => window.id === record.id);
    if (existing) {
      existing.endedAt = undefined;
      existing.endReason = undefined;
      this.save();
      return;
    }
    this.data.windows.push({ ...record, analysed: 0, failed: 0, items: [] });
    // Trimmed on write rather than on read, so the file cannot grow unbounded
    // even if nothing ever reads it back.
    if (this.data.windows.length > MAX_WINDOWS) {
      this.data.windows = this.list().slice(0, MAX_WINDOWS);
    }
    this.save();
  }

  private current() {
    return this.data.windows.find((window) => !window.endedAt);
  }

  /** Records that one item was fed. Counted at feed time so the row exists before the run finishes. */
  recordFed(key: string, title: string) {
    const window = this.current();
    if (!window) {
      return;
    }
    if (!window.items.some((item) => item.key === key)) {
      window.items.push({ key, title });
    }
    this.save();
  }

  recordOutcome(succeeded: boolean) {
    const window = this.current();
    if (!window) {
      return;
    }
    if (succeeded) {
      window.analysed++;
    } else {
      window.failed++;
    }
    this.save();
  }

  close(endReason: ScheduledBackfillEndReason, remaining: number | undefined, endedAt = new Date()) {
    const window = this.current();
    if (!window) {
      return;
    }
    window.endedAt = endedAt;
    window.endReason = endReason;
    window.remaining = remaining;
    this.save();
    logger.log(
      "info",
      `Scheduled backfill window ended (${endReason}): ${window.analysed} analysed, ${window.failed} failed${
        remaining === undefined ? "" : `, ${remaining} still eligible`
      }`
    );
  }
}
