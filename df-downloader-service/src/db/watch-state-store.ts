import { WatchState, logger, mergeWatchState } from "df-downloader-common";
import path from "path";
import { z } from "zod";
import { ensureDirectory } from "../utils/file-utils.js";
import { FileDb } from "./file-db.js";

const CURRENT_DB_VERSION = "1.0.0";

const WatchStateDbSchema = z.object({
  version: z.string(),
  lastUpdated: z.coerce.date(),
  /** Keyed by content key, because every access is "what about this one". */
  states: z.record(z.string(), WatchState).default({}),
});
type WatchStateDbSchema = z.infer<typeof WatchStateDbSchema>;

/**
 * What this app knows about what you have seen.
 *
 * Its own store rather than a field on the content entry, for one reason that
 * matters: position is written every ten seconds while a video plays, and
 * content entries are large and rewritten wholesale. Putting a value that
 * changes that often inside a record that big would rewrite the entire content
 * database throughout every viewing.
 *
 * Records only exist for content someone has actually started, so this stays
 * small next to the library - "never opened" is the absence of a record, not a
 * row saying zero.
 */
export class WatchStateStore {
  static async create(dbDir: string) {
    ensureDirectory(dbDir);
    const filename = path.join(dbDir, "watch-state.json");
    const fileDb = await FileDb.create<WatchStateDbSchema>({
      schema: WatchStateDbSchema,
      filename,
      initialData: {
        version: CURRENT_DB_VERSION,
        lastUpdated: new Date(),
        states: {},
      },
      backupDestination: async (data) => {
        const version = data?.version || "NO_VERSION";
        const backupDir = path.join(dbDir, "backups");
        ensureDirectory(backupDir);
        return path.join(backupDir, `watch-state-${version}-${Date.now()}.json`);
      },
      patchRoutine: async (data) => {
        // Version 1. The chain lives here so the next shape change adds a step
        // rather than a one-off migration script.
        if (data.version !== CURRENT_DB_VERSION) {
          data.version = CURRENT_DB_VERSION;
          return { data, patched: true };
        }
        return { data, patched: false };
      },
    });
    return new WatchStateStore(fileDb);
  }

  private constructor(private readonly fileDb: FileDb<WatchStateDbSchema>) {}

  private get data() {
    return this.fileDb.getData();
  }

  private save() {
    this.data.lastUpdated = new Date();
    // Coalesced rather than awaited: this is called on every progress report.
    this.fileDb.scheduleUpdateDb(this.data);
  }

  get(contentKey: string): WatchState | undefined {
    return this.data.states[contentKey];
  }

  getMany(contentKeys: string[]): WatchState[] {
    return contentKeys.map((key) => this.data.states[key]).filter((state): state is WatchState => Boolean(state));
  }

  getAll(): WatchState[] {
    return Object.values(this.data.states);
  }

  /** Content this app has any record of, which is what a sync needs to ask servers about. */
  knownKeys(): string[] {
    return Object.keys(this.data.states);
  }

  /**
   * Applies one piece of news about a piece of content.
   *
   * Always a merge rather than a write, because three things report into this
   * - this app's player, Plex and Jellyfin - and the last one to speak is not
   * necessarily the one that knows the most. See mergeWatchState for the rule.
   *
   * Returns the state that ended up stored, so a caller can tell whether its
   * own news actually won.
   */
  apply(incoming: WatchState): WatchState {
    const existing = this.data.states[incoming.contentKey];
    const merged = mergeWatchState(existing, incoming);
    const changed =
      !existing ||
      existing.watched !== merged.watched ||
      existing.positionSeconds !== merged.positionSeconds ||
      existing.durationSeconds !== merged.durationSeconds;
    this.data.states[incoming.contentKey] = merged;
    if (changed) {
      this.save();
      if (!existing?.watched && merged.watched) {
        logger.log("info", `Marked "${incoming.contentKey}" watched (from ${merged.source}).`);
      }
    }
    return merged;
  }

  /**
   * Sets state outright, for someone saying so by hand.
   *
   * The one path that bypasses the merge - "mark as unwatched" has to be able
   * to clear a flag the merge rule deliberately treats as sticky, or the
   * button would silently do nothing.
   */
  set(state: WatchState): WatchState {
    this.data.states[state.contentKey] = state;
    this.save();
    return state;
  }

  remove(contentKey: string) {
    if (this.data.states[contentKey]) {
      delete this.data.states[contentKey];
      this.save();
    }
  }
}
