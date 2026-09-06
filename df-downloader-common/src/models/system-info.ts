import { z } from "zod";

/**
 * A snapshot of what this install is and what it is running on.
 *
 * Exists because every support conversation about a self-hosted tool starts
 * with the same several rounds of "what version", "is it in Docker", "what
 * are your paths" - questions the app can answer about itself far better than
 * anyone can from memory. Rendered on the System page and included verbatim
 * in the diagnostic bundle, so the two can never disagree.
 *
 * Nothing here is a secret. Deliberately: this is the part of a bug report
 * that gets pasted into a public issue, so it holds counts, versions, paths
 * and booleans - never a key, a token or a cookie.
 */

export const ToolInfo = z.object({
  name: z.string(),
  /** Where it resolved to, which is half of every "command not found". */
  path: z.string(),
  available: z.boolean(),
  /** First line of its version output, or why asking failed. */
  version: z.string().optional(),
});
export type ToolInfo = z.infer<typeof ToolInfo>;

/**
 * One stored file, described without opening it properly.
 *
 * Version and size answer most "is your database in a strange state"
 * questions - a store still on an old version after an upgrade, or one that
 * has grown far past what it should be - and neither reveals a single record.
 */
export const DatabaseInfo = z.object({
  name: z.string(),
  sizeBytes: z.number(),
  /** The store's own schema version, where it records one. */
  version: z.string().optional(),
  lastUpdated: z.string().optional(),
});
export type DatabaseInfo = z.infer<typeof DatabaseInfo>;

export const SystemInfo = z.object({
  app: z.object({
    version: z.string(),
    branch: z.string(),
    /** Short commit sha. "unknown" when built outside a checkout and CI. */
    commit: z.string(),
    builtAt: z.string(),
    isContainer: z.boolean(),
    nodeVersion: z.string(),
    uptimeSeconds: z.number(),
  }),
  host: z.object({
    platform: z.string(),
    arch: z.string(),
    osRelease: z.string(),
    cpuModel: z.string(),
    cpuCount: z.number(),
    totalMemoryBytes: z.number(),
    freeMemoryBytes: z.number(),
    /** Absent on Windows, where the OS does not report one. */
    loadAverage: z.number().array().optional(),
    timezone: z.string(),
  }),
  paths: z.object({
    configDir: z.string(),
    workDir: z.string(),
    destinationDir: z.string(),
    logFile: z.string().optional(),
  }),
  tools: ToolInfo.array(),
  /** Versions and sizes only - never any of what the stores contain. */
  databases: DatabaseInfo.array(),
  /**
   * Counts only. Enough to answer "is your library in a strange state"
   * without anyone having to send their database.
   */
  content: z.object({
    entries: z.number(),
    downloaded: z.number(),
    analysed: z.number(),
    /** Of those, how many hold an error rather than a result. */
    analysesFailed: z.number(),
    withArticle: z.number(),
    legacy: z.number(),
  }),
  /** Which optional pieces are switched on - never how they are configured. */
  features: z.object({
    signedIntoDf: z.boolean(),
    subtitlesService: z.string(),
    aiProvider: z.string(),
    plexEnabled: z.boolean(),
    jellyfinEnabled: z.boolean(),
    scheduledBackfillEnabled: z.boolean(),
    automaticDownloadsEnabled: z.boolean(),
  }),
});
export type SystemInfo = z.infer<typeof SystemInfo>;
