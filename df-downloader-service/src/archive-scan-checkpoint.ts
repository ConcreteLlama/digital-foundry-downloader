import fs from "fs";
import path from "path";
import { logger } from "df-downloader-common";
import { ensureEnvString } from "./utils/env-utils.js";

/**
 * Lightweight, un-versioned resume checkpoint for scanWholeArchive() -
 * deliberately kept as its own plain file rather than a field on one of the
 * FileDb-versioned DBs (see db/file-dbs/): it's just a resume hint, safe to
 * ignore, reset, or delete outright with zero data-loss risk (worst case,
 * the next scan just starts further back than it strictly needed to).
 *
 * scanWholeArchive() runs on every app startup (via runInitialScan(),
 * regardless of firstRunComplete) and always used to walk from page 1 -
 * meaning every restart re-requested the entire archive's worth of listing
 * pages from digitalfoundry.net even when nothing had changed since the
 * last successful scan. This exists to cut that down, on top of surviving
 * a crash/restart mid-scan.
 *
 * `legacyResolutionInProgress` tracks a second, coarser-grained resumable
 * state: whether the current walk is a one-time full pass from offset 0
 * (triggered when the DB has entries still flagged `legacy` - see
 * DfContentInfo.legacy) rather than the normal tail-only resume. It's
 * stored here rather than tracked in memory so that pass survives a
 * crash/restart too - resuming from `offset` directly (not the normal
 * safety-margin rewind) instead of restarting the whole walk from 0 again.
 * See docs/DF_SITE_MIGRATION.md.
 *
 * `walkComplete` records that a walk ran off the true end of the archive
 * rather than being cut short by the maxArchivePage cap. Without it the
 * ordinary (non-legacy) path had no notion of being finished: `offset` only
 * ever moves forward, so every restart re-walked the final safety margin of
 * an already-complete backfill - a few listing pages of requests against
 * digitalfoundry.net, on every install, on every container restart, that could
 * never find anything. New content never came from here anyway; it comes from
 * checkForNewContents() walking the newest end. The legacy path already had
 * this notion via `legacyResolutionInProgress`; this is the same idea for the
 * normal case. Deleting this file remains the way to force a fresh full walk.
 */

const checkpointPath = () => path.join(ensureEnvString("DB_DIR", "db"), "archive-scan-checkpoint.json");

type ArchiveScanCheckpoint = {
  offset: number;
  legacyResolutionInProgress: boolean;
  walkComplete: boolean;
  updatedAt: string;
};

type ArchiveScanCheckpointState = Pick<
  ArchiveScanCheckpoint,
  "offset" | "legacyResolutionInProgress" | "walkComplete"
>;

export async function getArchiveScanCheckpoint(): Promise<ArchiveScanCheckpointState> {
  try {
    const raw = await fs.promises.readFile(checkpointPath(), "utf-8");
    // A leading UTF-8 BOM (e.g. from a file hand-edited/created via
    // PowerShell's `Set-Content -Encoding utf8`, which adds one by default)
    // makes JSON.parse throw - confirmed 2026-08-15 while manually seeding
    // this file for testing. Node's own writeFile below never adds one, but
    // strip it defensively rather than relying on that.
    const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const parsed = JSON.parse(withoutBom) as Partial<ArchiveScanCheckpoint>;
    return {
      offset: typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0,
      legacyResolutionInProgress: parsed.legacyResolutionInProgress === true,
      // Absent in checkpoints written before this field existed, which is
      // exactly right: those installs get one more walk, which then completes
      // and records itself.
      walkComplete: parsed.walkComplete === true,
    };
  } catch {
    return { offset: 0, legacyResolutionInProgress: false, walkComplete: false };
  }
}

export async function setArchiveScanCheckpoint(checkpoint: ArchiveScanCheckpointState): Promise<void> {
  const data: ArchiveScanCheckpoint = { ...checkpoint, updatedAt: new Date().toISOString() };
  try {
    await fs.promises.writeFile(checkpointPath(), JSON.stringify(data, null, 2));
  } catch (e) {
    logger.log(
      "warn",
      "Failed to persist archive scan checkpoint (non-fatal - the next scan will just resume further back than necessary)",
      e
    );
  }
}
