import {
  bytesToHumanReadable,
  ContentMoveFileInfo,
  CURRENT_DATA_VERSION,
  DfContentEntry,
  DfContentEntryUpdate,
  DfContentEntryUtils,
  DfContentInfo,
  DfContentInfoUtils,
  DfContentAvailability,
  DfContentAvailabilityInfo,
  fileSizeStringToBytes,
  filterContentInfos,
  getMediaFormatIndex,
  logger,
  filterEmpty,
  getBestMediaInfoMatch,
  ManualDownloadRequest,
  MediaInfo,
  randomIntInRange,
  ScheduledDownloadInfo,
  slugifyTitle
} from "df-downloader-common";
import { getArchiveScanCheckpoint, setArchiveScanCheckpoint } from "./archive-scan-checkpoint.js";
import { configService } from "./config/config.js";
import { ContentInfoWithAvailability, DfDownloaderOperationalDb, DownloadInfoWithName } from "./db/df-operational-db.js";
import { forEachListingPage, fetchContentInfo, DfFetchOpts } from "./df-fetcher.js";
import { DfFetchPriority } from "./df-request-queue.js";
import { DfTaskManager } from "./df-task-manager.js";
import { DfUserManager } from "./df-user-manager.js";
import { serviceLocator } from "./services/service-locator.js";
import { findExistingContent } from "./utils/content-finder.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { deleteFile, ensureDirectory, fileExists, pathIsEqual } from "./utils/file-utils.js";
import { dfFetchWorkerQueue } from "./utils/queue-utils.js";
import { getFileMoveList } from "./utils/template-utils.js";
import { syncYtVideoMeta } from "./utils/youtube/sync-yt-video-meta.js";

export class DigitalFoundryContentManager {
  private dfUserManager: DfUserManager;
  readonly taskManager: DfTaskManager;
  noMediaContentInfos: Map<
    string,
    {
      attempts: number;
      contentInfo: DfContentInfo;
    }
  > = new Map();
  metaFetchesInProgress: number = 0;
  /**
   * Content queued for a delayed auto-download, still waiting out its
   * jittered delay - not a task/pipeline yet (those only get created once the
   * delay elapses and downloadContent() actually runs), so this is the only
   * place this state exists. Exposed via getScheduledDownloads() for the
   * REST API/UI, since users otherwise have no visibility into it at all.
   */
  private scheduledDownloads: Map<string, ScheduledDownloadInfo> = new Map();
  /**
   * False from process start until the initial startup scan (see start())
   * finishes - the tier-change listener fires from within
   * DfUserManager.start(), before runInitialScan() has even begun, and its
   * refreshMeta() call would otherwise contend with the scan's own listing
   * requests for the same single-concurrency dfFetch queue (confirmed live
   * 2026-08-15: a scan that should take seconds per page took minutes per
   * page with both running at once). Entries that need refreshing before
   * the scan completes are collected in pendingStartupMetaRefresh instead
   * and flushed once it's done - the scan itself will have already cleared
   * most of them anyway (see scanWholeArchive's `legacy` handling).
   */
  private startupScanComplete = false;
  private pendingStartupMetaRefresh = new Set<string>();
  /**
   * Re-entrancy lock for scanWholeArchive() specifically (metaFetchesInProgress
   * covers both scanWholeArchive and refreshMeta and is used to decide whether
   * userTierChanged() should defer, not to prevent two archive walks from
   * starting at once). Needed because scanWholeArchive can now be triggered
   * from more than one place that isn't naturally serialized against itself:
   * the startup sequence, configUpdated:digitalFoundry re-firing on a rapid
   * series of cookie pastes, and the recurring poll loop's checkForNewContents
   * path all funnel through runInitialScan/scanWholeArchive independently.
   * Without this, two overlapping walks would both read/advance the same
   * on-disk checkpoint file, corrupting the resume offset.
   */
  private archiveScanInProgress = false;

  constructor(readonly db: DfDownloaderOperationalDb) {
    this.dfUserManager = new DfUserManager(db);
    this.dfUserManager.addUserTierChangeListener((tier) => this.userTierChanged(tier));
    this.taskManager = new DfTaskManager();
    configService.on("configUpdated:contentManagement", ({ newValue, oldValue }) => {
      if (newValue.destinationDir !== oldValue.destinationDir) {
        ensureDirectory(newValue.destinationDir);
        this.taskManager.scanForExistingContent(this);
      }
      if (newValue.workDir !== oldValue.workDir) {
        ensureDirectory(newValue.workDir);
      }
    });
    //TODO: Do this on both update and load (maybe make a new event for configLoadOrUpdate)
    configService.on("configUpdated:contentManagement", ({ newValue, oldValue }) => {
      if (newValue.destinationDir !== oldValue.destinationDir) {
        ensureDirectory(newValue.destinationDir);
      }
      if (newValue.workDir !== oldValue.workDir) {
        ensureDirectory(newValue.workDir);
      }
    });
  }

  // DISABLED: We can reintroduce this when there's a new site but for now most of this is useless.
  async start_reinstate_when_new_site() {
    ensureDirectory(configService.config.contentManagement.destinationDir);
    ensureDirectory(configService.config.contentManagement.workDir);
    const contentManagementConfig = configService.config.contentManagement;
    const contentDetectionConfig = configService.config.contentDetection;
    //TODO: Queue all downloads in "ATTEMPTING_DOWNLOAD" state
    await this.dfUserManager.start();
    if (await this.db.isFirstRunComplete()) {
      const newContentList = await this.getNewContentList();
      // Skip new content list when scanning whole archive so the normal auto download process can work
      // (this code will only scan and add to DB, not initiate downloads)
      await this.scanWholeArchive(...[...newContentList.newContent, ...newContentList.updatedContent].map((contentRef) => contentRef.key));
      await this.patchMetas();
    } else {
      logger.log("info", "First run not complete, scanning whole archive");
      await this.scanWholeArchive();
      await this.db.setFirstRunComplete(true);
    }
    if (contentManagementConfig.scanForExistingFiles) {
      const scanTask = this.taskManager.scanForExistingContent(this);
      await scanTask.awaitResult();
    }
    logger.log(
      "info",
      `Starting DF content monitor. Checking for new content every ${contentDetectionConfig.contentCheckInterval}ms`
    );
    configService.on("configUpdated:digitalFoundry", ({ oldValue, newValue }) => {
      const oldSessionId = oldValue.sessionId;
      const newSessionId = newValue.sessionId;
      if (newSessionId !== oldSessionId) {
        this.dfUserManager.checkDfUserInfo();
      }
    });

    const checkForNewContent = async () => {
      await this.dfUserManager.checkDfUserInfo();
      await this.checkForNewContents();
    };
    checkForNewContent();
    setInterval(checkForNewContent, contentDetectionConfig.contentCheckInterval);
  }

  async start() {
    ensureDirectory(configService.config.contentManagement.destinationDir);
    ensureDirectory(configService.config.contentManagement.workDir);
    const contentManagementConfig = configService.config.contentManagement;
    //TODO: Queue all downloads in "ATTEMPTING_DOWNLOAD" state
    await this.dfUserManager.start();
    // Never scan the new site unauthenticated - it's partially browsable
    // logged-out (titles/thumbnails, no real download links - every download
    // href comes back as the literal string "login"), which isn't useful data
    // and isn't something to fetch by default just because it's technically
    // reachable. Only scan once dfUserManager confirms a real, subscribed
    // session (see DfUserManager.isUserSignedIn()).
    if (this.dfUserManager.isUserSignedIn()) {
      await this.runInitialScan();
    } else {
      logger.log(
        "info",
        "Not scanning Digital Foundry - no valid autologin cookie configured (or account isn't a subscriber). Configure it in Settings > Digital Foundry."
      );
    }
    this.startupScanComplete = true;
    await this.flushPendingMetaRefresh();
    if (contentManagementConfig.scanForExistingFiles) {
      const scanTask = this.taskManager.scanForExistingContent(this);
      await scanTask.awaitResult();
    }
    configService.on("configUpdated:digitalFoundry", async ({ oldValue, newValue }) => {
      if (newValue.sessionId === oldValue.sessionId) {
        return;
      }
      const wasSignedIn = this.dfUserManager.isUserSignedIn();
      // Interactive priority - the user is actively waiting on this (the
      // settings form's await-login poll blocks on it), so it shouldn't
      // queue behind whatever background scan/refresh work is already
      // pending.
      await this.dfUserManager.checkDfUserInfo(DfFetchPriority.INTERACTIVE);
      if (!wasSignedIn && this.dfUserManager.isUserSignedIn()) {
        logger.log("info", "Digital Foundry authentication configured - starting archive scan");
        await this.runInitialScan();
        // Same reasoning as the startup flush below - checkDfUserInfo() (just
        // above) fires userTierChanged() as an un-awaited side effect, which
        // races this scan for the same rate-limited queue every time
        // (confirmed live 2026-08-18: existing installs upgrading to this
        // version need to paste a fresh cookie after the app's already
        // running, hitting exactly this path, not just the one-time startup
        // window startupScanComplete was written for).
        await this.flushPendingMetaRefresh();
        // runInitialScan only walks the archive from its saved checkpoint,
        // which sits at the oldest end of a newest-first listing - so on its
        // own it never surfaces anything published recently. Someone who has
        // just pasted a working cookie is precisely the person waiting to see
        // recent content, so check the newest end explicitly rather than
        // leaving them until the poll loop's next tick.
        await this.checkForNewContents();
      }
    });
    this.startContentPollLoop();
  }

  /**
   * Re-checks and refreshes whatever userTierChanged() deferred into
   * pendingStartupMetaRefresh while a scan was in flight (see its callers -
   * both the initial startup sequence and the configUpdated:digitalFoundry
   * "just signed in" path funnel through here, since both can race
   * userTierChanged() against a scan for the same request queue).
   */
  private async flushPendingMetaRefresh() {
    if (this.pendingStartupMetaRefresh.size === 0) {
      return;
    }
    const pending = Array.from(this.pendingStartupMetaRefresh);
    this.pendingStartupMetaRefresh.clear();
    // Re-check against current DB state rather than trusting the snapshot
    // taken when each item was deferred - the scan that just ran (if any)
    // may well have already resolved most of these via its own writes
    // (setContentInfosWithAvailability populates availabilityInTiers too),
    // and items given up on (unpatchable) shouldn't be re-attempted here
    // either. Confirmed live 2026-08-15: without this re-check, a DB with
    // ~2400 recently-legacy entries deferred ~2200 of them here even
    // though the scan had already resolved all but ~40 of them seconds
    // earlier - would have cost well over an hour of redundant per-item
    // searches for zero benefit.
    const stillPending = await this.filterStillNeedingMetaRefresh(pending);
    if (stillPending.length > 0) {
      logger.log(
        "info",
        `Scan complete - refreshing metadata for ${stillPending.length} of ${pending.length} deferred entries (the rest were already resolved by the scan)`
      );
      await this.refreshMeta(stillPending);
    }
  }

  /**
   * Recurring "is there anything new" check (see checkForNewContents) - the
   * one-time startup scan above only covers the moment the app starts.
   * Skips entirely while not signed in rather than checking anyway and
   * relying on checkForNewContents to no-op, mirroring the same
   * signed-in-gating start() already applies to the initial scan (see its
   * comment) - DfUserManager's own periodic auth recheck (schedulePeriodicRecheck)
   * is a separate, already-conservative mechanism for noticing sign-in
   * changes; this loop doesn't need to duplicate it.
   *
   * The interval and auto-download age window are both real config
   * (contentDetection.contentCheckInterval / automaticDownloads.maxContentAgeHours)
   * rather than hardcoded, deliberately conservative by default - Digital
   * Foundry publishes at most a few times a day, and this is a small team's
   * infrastructure, not a CDN-subsidized one (see docs/DF_SITE_MIGRATION.md).
   * A prior version of this loop (see the dead start_reinstate_when_new_site())
   * polled unconditionally regardless of sign-in state, which is what
   * actually got a real IP banned during testing - see DfUserManager's
   * schedulePeriodicRecheck doc comment.
   */
  private startContentPollLoop() {
    const { contentCheckInterval } = configService.config.contentDetection;
    logger.log("info", `Checking for new Digital Foundry content every ${contentCheckInterval}ms while signed in`);
    const runCheck = async () => {
      if (!this.dfUserManager.isUserSignedIn()) {
        return;
      }
      try {
        await this.checkForNewContents();
      } catch (e) {
        logger.log("error", "Error during scheduled content check", e);
      }
    };
    // Run once up front rather than waiting a full interval. Nothing else
    // in startup looks at the newest end of the listing - runInitialScan
    // only calls scanWholeArchive, which resumes near its saved checkpoint
    // at the *oldest* end - so without this, an install that starts up
    // already signed in doesn't notice anything published since it was last
    // running until a whole contentCheckInterval has elapsed.
    void runCheck();
    setInterval(runCheck, contentCheckInterval);
  }

  private async runInitialScan() {
    if (await this.db.isFirstRunComplete()) {
      await this.scanWholeArchive();
    } else {
      logger.log("info", "First run not complete, scanning whole archive");
      await this.scanWholeArchive();
      await this.db.setFirstRunComplete(true);
    }
  }

  private normalizeTitleForMatching(title: string): string {
    return title.trim().toLowerCase().replace(/\s+/g, " ");
  }

  /**
   * Single pass over the whole DB, gathering two things scanWholeArchive
   * needs up front (avoids reading the whole content-info DB twice):
   * - legacyTitleMap: normalized title -> legacy key, for every entry still
   *   under a legacy-<slug> key (assigned during the key/name migration for
   *   entries with no cached YouTube ID at the time - see
   *   docs/DF_SITE_MIGRATION.md). Used to recognize when a freshly-scraped
   *   item (which now resolves to a real yt-/dl- key) is actually the same
   *   content as an existing legacy entry, rather than creating a duplicate.
   * - unresolvedLegacyCount: how many entries are still `legacy` and not yet
   *   `unpatchable` - i.e. still need their data confirmed against the live
   *   site. Used to decide whether this scan needs to be a full walk from
   *   offset 0 (see scanWholeArchive).
   */
  private async buildScanState(): Promise<{ legacyTitleMap: Map<string, string>; unresolvedLegacyCount: number }> {
    const allEntries = await this.db.getAllContentEntries();
    const legacyTitleMap = new Map<string, string>();
    let unresolvedLegacyCount = 0;
    for (const entry of allEntries) {
      if (entry.key.startsWith("legacy-")) {
        legacyTitleMap.set(this.normalizeTitleForMatching(entry.contentInfo.title), entry.key);
      }
      if (entry.contentInfo?.legacy && !entry.contentInfo?.unpatchable) {
        unresolvedLegacyCount++;
      }
    }
    return { legacyTitleMap, unresolvedLegacyCount };
  }

  /**
   * Merges freshly-scraped items into their matching existing legacy-keyed
   * entries (matched by title - see buildScanState): adopts each new
   * key and metadata (current, has real working download links) but
   * carries the legacy entry's availability/download history forward onto
   * the new key, records the old key in possibleAltKeys for traceability,
   * and removes the old legacy entry so it doesn't linger as a duplicate.
   * Confirmed live 2026-08-15 that without this, ~100 Patreon-bonus-only
   * items (no YouTube link on the old site, so no youtubeVideoId to rekey
   * against during migration) end up duplicated the first time a live scan
   * finds them again under a real yt-<id> key.
   *
   * Batched into 3 DB calls total for the whole list, not per item - each
   * DB write is a full-file rewrite (see FileDb.updateDb()), so reconciling
   * even a modestly busy page (20-30 items isn't unusual early in a
   * migration scan) one item at a time meant 100+ full rewrites of a
   * multi-MB JSON file per page, adding real seconds of pure write-queue
   * overhead on top of the (intentional) network pacing - confirmed live
   * 2026-08-15 as the actual cause of a scan taking far longer than the
   * request spacing alone would explain.
   */
  private async reconcileLegacyEntries(
    toReconcile: { legacyKey: string; contentInfo: DfContentInfo }[],
    userTier: string
  ) {
    if (toReconcile.length === 0) {
      return;
    }
    const legacyEntries = await this.db.getContentEntryMap(toReconcile.map(({ legacyKey }) => legacyKey));
    const mergedContentMetas: ContentInfoWithAvailability[] = [];
    const downloadsToTransfer: DownloadInfoWithName[] = [];
    const legacyKeysToRemove: string[] = [];
    for (const { legacyKey, contentInfo } of toReconcile) {
      const legacyEntry = legacyEntries.get(legacyKey);
      const mergedContentInfo: DfContentInfo = {
        ...contentInfo,
        possibleAltKeys: Array.from(new Set([...(contentInfo.possibleAltKeys || []), legacyKey])),
      };
      const availability =
        mergedContentInfo.mediaInfo.length > 0 ? DfContentAvailability.AVAILABLE : DfContentAvailability.PAYWALLED;
      mergedContentMetas.push({ contentInfo: mergedContentInfo, availability });
      if (legacyEntry?.downloads?.length) {
        downloadsToTransfer.push(
          ...legacyEntry.downloads.map((downloadInfo) => ({ name: mergedContentInfo.key, downloadInfo }))
        );
      }
      legacyKeysToRemove.push(legacyKey);
      logger.log(
        "info",
        `Reconciled legacy entry ${legacyKey} -> ${mergedContentInfo.key} ("${mergedContentInfo.title}")`
      );
    }
    await this.db.setContentInfosWithAvailability(mergedContentMetas, userTier);
    if (downloadsToTransfer.length > 0) {
      await this.db.addDownloads(downloadsToTransfer);
    }
    await this.db.removeContentInfos(legacyKeysToRemove, true);
  }

  // ~3 pages worth at the default page limit - covers any new content that
  // shifted existing entries forward (the listing is newest-first, so new
  // uploads since the last checkpoint push everything else to a higher
  // offset) without needing to track exactly how much shifted.
  private static readonly ARCHIVE_SCAN_RESUME_SAFETY_MARGIN_ITEMS = 150;
  private static readonly ARCHIVE_SCAN_PAGE_LIMIT = 50;

  async scanWholeArchive(...ignoreList: string[]) {
    // Never hit the network while signed out - a caller racing sign-out
    // (config update, tier-change listener, poll loop) should just no-op
    // here rather than firing a walk's worth of guaranteed-to-fail requests.
    if (!this.dfUserManager.isUserSignedIn()) {
      logger.log("info", "Skipping archive scan - not signed in to Digital Foundry");
      return;
    }
    if (this.archiveScanInProgress) {
      logger.log("info", "Archive scan already in progress, skipping duplicate request");
      return;
    }
    this.archiveScanInProgress = true;
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    let finalCheckpointOffset = 0;
    let hitPageCap = false;
    let resolvingLegacy = false;
    try {
      this.metaFetchesInProgress++;
      const contentDetectionConfig = configService.config.contentDetection;
      const checkpoint = await getArchiveScanCheckpoint();
      const { legacyTitleMap, unresolvedLegacyCount } = await this.buildScanState();
      let startOffset: number;
      if (checkpoint.legacyResolutionInProgress) {
        // An earlier full walk got interrupted (crash/restart) - resume it
        // exactly where it left off rather than restarting from 0 or falling
        // back to the normal tail-only resume.
        resolvingLegacy = true;
        startOffset = checkpoint.offset;
        logger.log("info", `Resuming in-progress full archive walk (started to resolve legacy entries) from offset ${startOffset}`);
      } else if (unresolvedLegacyCount > 0) {
        // Some entries still don't have data confirmed against the live
        // site (see DfContentInfo.legacy). The normal tail-only resume would
        // never revisit the earlier pages those entries live on, so do one
        // full walk from the start instead - relying on refreshMeta()'s much
        // slower, much less reliable per-item title-search fallback to
        // eventually get to all of these was confirmed live 2026-08-15 to be
        // impractical at real scale (~2400 legacy entries would take in the
        // order of a day to work through that way, mostly failing). This
        // full walk is itself resumable (see checkpoint.legacyResolutionInProgress
        // above) so an interruption just picks back up, not starts over.
        resolvingLegacy = true;
        startOffset = 0;
        logger.log("info", `${unresolvedLegacyCount} entries still need their data confirmed against the live site - doing a full archive walk from the start instead of the usual tail-only resume`);
        await setArchiveScanCheckpoint({ offset: 0, legacyResolutionInProgress: true });
      } else {
        startOffset = Math.max(0, checkpoint.offset - DigitalFoundryContentManager.ARCHIVE_SCAN_RESUME_SAFETY_MARGIN_ITEMS);
      }
      finalCheckpointOffset = startOffset;
      logger.log(
        "info",
        `Scanning whole archive (max ${contentDetectionConfig.maxArchivePage} pages)${startOffset > 0 ? ` - resuming from offset ${startOffset}` : ""}`
      );
      // The new site's listing already returns full content info per page (no
      // separate per-video detail fetch needed), so this is just a DB dedupe
      // + bulk write per page rather than a per-item fetch loop.
      await forEachListingPage(
        async (contentInfos, pageIdx, offset) => {
          //We may not have finished completing our first run last time so we should filter the content list
          let filtered = ignoreList.length ? contentInfos.filter((contentInfo) => !ignoreList.includes(contentInfo.key)) : contentInfos;
          const existingContentInfos = await this.db.getContentEntryMap(filtered.map((contentInfo) => contentInfo.key));
          const toReconcile: { legacyKey: string; contentInfo: DfContentInfo }[] = [];
          // Entries already at their final key (never needed legacy-key
          // reconciliation - e.g. an entry that already had a cached
          // youtubeVideoId at migration time) still need their `legacy`
          // flag cleared once we've actually confirmed fresh data for them.
          // The scan already has that fresh data in hand for every item on
          // this page at zero extra request cost, so use it - relying on
          // patchMetas()'s much slower, much less reliable per-item
          // title-search fallback to eventually get to all of these was
          // confirmed live 2026-08-15 to be impractical at real scale
          // (~2400 legacy entries would take in the order of a day to work
          // through that way, mostly failing).
          const toRefreshLegacy: DfContentInfo[] = [];
          filtered = filtered.filter((contentInfo) => {
            const existing = existingContentInfos.get(contentInfo.key);
            if (existing && existing.contentInfo) {
              if (existing.contentInfo.legacy) {
                toRefreshLegacy.push(contentInfo);
              }
              return false;
            }
            const normalizedTitle = this.normalizeTitleForMatching(contentInfo.title);
            const legacyKey = legacyTitleMap.get(normalizedTitle);
            if (legacyKey) {
              // Consume the match so a second item with a coincidentally
              // identical title doesn't also try to claim the same legacy
              // entry.
              legacyTitleMap.delete(normalizedTitle);
              toReconcile.push({ legacyKey, contentInfo });
              return false;
            }
            return true;
          });
          await this.reconcileLegacyEntries(toReconcile, userTier);
          if (toRefreshLegacy.length > 0) {
            logger.log(
              "info",
              `Refreshed ${toRefreshLegacy.length} legacy entries found again on page ${pageIdx} (${toRefreshLegacy.map((c) => c.key).join(", ")})`
            );
          }
          const toWrite = [...filtered, ...toRefreshLegacy];
          if (toWrite.length > 0) {
            if (filtered.length > 0) {
              logger.log("info", `Found ${filtered.length} new content entries on page ${pageIdx}`);
            }
            const contentMetas: ContentInfoWithAvailability[] = toWrite.map((contentInfo) => ({
              contentInfo,
              availability: contentInfo.mediaInfo.length > 0 ? DfContentAvailability.AVAILABLE : DfContentAvailability.PAYWALLED,
            }));
            await this.db.setContentInfosWithAvailability(contentMetas, userTier);
          }
          // Checkpoint last, only once this page's content is durably
          // written - if this ran first and the process died mid-page,
          // the checkpoint would point past content that was never
          // actually saved.
          finalCheckpointOffset = offset + DigitalFoundryContentManager.ARCHIVE_SCAN_PAGE_LIMIT;
          await setArchiveScanCheckpoint({ offset: finalCheckpointOffset, legacyResolutionInProgress: resolvingLegacy });
          const shouldContinue = pageIdx < contentDetectionConfig.maxArchivePage;
          if (!shouldContinue) {
            hitPageCap = true;
          }
          return shouldContinue;
        },
        {
          offset: startOffset,
          limit: DigitalFoundryContentManager.ARCHIVE_SCAN_PAGE_LIMIT,
          label: resolvingLegacy ? "Full archive walk" : "Archive scan",
        }
      );
      if (resolvingLegacy && !hitPageCap) {
        // forEachListingPage ran off the true end of the archive (rather
        // than being cut off by the maxArchivePage safety cap), so every
        // legacy entry that still exists on the live site was encountered
        // and cleared above. Anything still flagged legacy at this point is
        // confirmed absent - stop auto-retrying it (same rationale as
        // giveUpOnMetaRefresh: a manual "refresh metadata" retry remains
        // available per-item).
        const remainingEntries = await this.db.getAllContentEntries();
        const stillLegacy = remainingEntries
          .filter((entry) => entry.contentInfo?.legacy && !entry.contentInfo?.unpatchable)
          .map((entry) => entry.contentInfo);
        if (stillLegacy.length > 0) {
          await this.db.setContentInfos(stillLegacy.map((contentInfo) => ({ ...contentInfo, unpatchable: true })));
          logger.log(
            "info",
            `Full archive walk complete - ${stillLegacy.length} entries weren't found on the live site, marking unpatchable (won't auto-retry; use "refresh metadata" to retry manually)`
          );
        } else {
          logger.log("info", "Full archive walk complete - all previously-legacy entries were confirmed against the live site");
        }
        await setArchiveScanCheckpoint({ offset: finalCheckpointOffset, legacyResolutionInProgress: false });
      }
    } finally {
      this.metaFetchesInProgress--;
      this.archiveScanInProgress = false;
    }
    logger.log("info", `Finished scanning whole archive`);
  }

  async patchMetas() {
    const contentEntries = await this.db.getAllContentEntries();
    const requiringMetaRefresh = new Set<string>();
    const contentInfosToUpdate: DfContentInfo[] = [];
    for (const contentEntry of contentEntries) {
      if (!contentEntry.contentInfo) {
        logger.log("debug", `Content entry ${contentEntry.key} has no meta, skipping`);
        continue;
      }
      let updatesMade = false;
      if (contentEntry.contentInfo.mediaInfo?.length === 0 && this.dfUserManager.getCurrentTier()) {
        logger.log("info", `Content entry ${contentEntry.key} has no media info, adding to no media list`);
        this.noMediaContentInfos.set(contentEntry.key, {
          attempts: 0,
          contentInfo: contentEntry.contentInfo,
        });
        continue;
      } else {
        contentEntry.contentInfo.mediaInfo = contentEntry.contentInfo.mediaInfo.filter((mediaInfo) => {
          if (mediaInfo.size === undefined) {
            mediaInfo.size = 0;
            updatesMade = true;
          }
          if (mediaInfo.mediaFilename) {
            const urlFilename = mediaInfo.mediaFilename;
            if (!Boolean(urlFilename?.trim()?.length)) {
              logger.log(
                "info",
                `Media info for ${contentEntry.key} ("${contentEntry.contentInfo.title}") contains invalid entry with URL that doesn't contain a file path, removing`
              );
              updatesMade = true;
              return false;
            }
          } else if (contentEntry.statusInfo.availability === DfContentAvailability.UNKNOWN) {
            requiringMetaRefresh.add(contentEntry.key);
          }
          return true;
        });
      }
      if (updatesMade) {
        contentInfosToUpdate.push(contentEntry.contentInfo);
      }
    }
    if (contentInfosToUpdate.length > 0) {
      await this.db.setContentInfos(contentInfosToUpdate);
    }
    const requiringUpdate = contentEntries
      .filter(
        (contentEntry) =>
          !contentEntry.contentInfo ||
          (contentEntry.contentInfo.legacy && !contentEntry.contentInfo.unpatchable) ||
          requiringMetaRefresh.has(contentEntry.key)
      )
      .sort((a, b) => b.contentInfo?.publishedDate.getTime() - a.contentInfo?.publishedDate.getTime());
    if (requiringUpdate.length === 0) {
      logger.log("info", "No content entries require meta patching");
      return;
    }
    await this.refreshMeta(requiringUpdate.map((contentEntry) => contentEntry.key));
  }

  async refreshMeta(contentNames: string[], opts: { priority?: number } = {}) {
    // Same reasoning as scanWholeArchive's guard - refreshMeta is reachable
    // from several places (patchMetas, userTierChanged, flushPendingMetaRefresh)
    // that don't all independently check sign-in state, so enforce it here
    // rather than relying on every caller to remember to.
    if (!this.dfUserManager.isUserSignedIn()) {
      logger.log("info", `Skipping metadata refresh for ${contentNames.length} entries - not signed in to Digital Foundry`);
      return [];
    }
    const refreshedMetaKeys = new Set<string>();
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    // Copy - about to splice() this locally, and some callers pass an array
    // they still hold a reference to.
    const remaining = [...contentNames];
    try {
      this.metaFetchesInProgress++;
      while (remaining.length > 0) {
        const entryBatch = remaining.splice(0, 10);
        const contentInfoResults = await Promise.allSettled(
          entryBatch.map((contentName) =>
            dfFetchWorkerQueue.addWork(async () => {
              // The new site has no per-item lookup endpoint - fetchContentInfo
              // does a best-effort title search, so give it whatever title we
              // already have on record for this entry.
              const existingEntry = await this.db.getContentEntry(contentName).catch(() => undefined);
              logger.log("info", `${contentName} has out of date meta; fetching info and patching`);
              return fetchContentInfo(contentName, existingEntry?.contentInfo?.title, { priority: opts.priority });
            })
          )
        );
        const toUpdate: ContentInfoWithAvailability[] = [];
        const unresolvable: string[] = [];
        contentInfoResults.forEach((result, idx) => {
          if (result.status === "rejected") {
            logger.log("error", `Failed to fetch meta for ${entryBatch[idx]} ${result.reason}`);
            unresolvable.push(entryBatch[idx]);
          } else {
            logger.log("info", `Successfully fetched meta for ${result.value.contentInfo.key}`);
            const { contentInfo, availability} = result.value;
            toUpdate.push({
              contentInfo,
              availability,
            });
          }
        });
        await this.db.setContentInfosWithAvailability(toUpdate, userTier);
        if (unresolvable.length > 0) {
          await this.giveUpOnMetaRefresh(unresolvable);
        }
      }
    } finally {
      this.metaFetchesInProgress--;
    }
    return filterEmpty(await this.db.getContentEntryList([...refreshedMetaKeys]));
  }

  /**
   * fetchContentInfo's best-effort title-search-then-page-scan sometimes
   * just can't relocate an item (older/very specific content that's scrolled
   * past the ~250 most-recent items) - confirmed live 2026-08-15 that
   * without this, patchMetas() re-flags it and refreshMeta() re-attempts it
   * on every single future restart, forever, wasting both time and DF
   * requests on something that will keep failing the same way.
   *
   * Sets `unpatchable: true` so it stops being re-flagged - `legacy` stays
   * true (we still don't have live-confirmed data for it, which may mean a
   * dead old-site download URL for entries carried over from the
   * pre-relaunch migration), this only stops the automatic background
   * retry loop, not the ability to fix it: downloadContent() already does
   * its own live refetch before using cached mediaInfo for any actual
   * download, and the "refresh metadata" UI action remains available to
   * retry a specific item by hand (refreshMeta() itself doesn't check
   * `unpatchable` - only patchMetas()'s automatic path does).
   *
   * Doesn't address patchMetas()'s other, separate requiringMetaRefresh
   * trigger (missing mediaFilename + unknown availability) - not the path
   * confirmed to be looping in practice, so left alone for now rather than
   * guarding against a theoretical case.
   */
  private async giveUpOnMetaRefresh(contentNames: string[]) {
    const entries = await this.db.getContentEntryMap(contentNames);
    const contentInfos = contentNames
      .map((name) => entries.get(name)?.contentInfo)
      .filter((info): info is DfContentInfo => !!info)
      .map((info) => ({ ...info, unpatchable: true }));
    if (contentInfos.length === 0) {
      return;
    }
    await this.db.setContentInfos(contentInfos);
    logger.log(
      "info",
      `Giving up on auto-refreshing metadata for ${contentInfos.map((c) => c.key).join(", ")} - couldn't relocate them on the live site. Their data may be stale; use "refresh metadata" to retry manually.`
    );
  }

  async scanForExistingFiles() {
    const contentManagementConfig = configService.config.contentManagement;
    const contentEntries = await this.db.getAllContentEntries();

    const { destinationDir, maxScanDepth } = contentManagementConfig;
    logger.log("info", `Scanning for existing files in ${destinationDir} with max depth ${maxScanDepth}`);

    const fileMatches = await findExistingContent(destinationDir, maxScanDepth, contentEntries);
    const toAddDownload: DownloadInfoWithName[] = [];
    for (const fileMatch of fileMatches.matches) {
      const { closestMatch, filePathInfo } = fileMatch;
      if (closestMatch.contentEntry.downloads.some((d) => pathIsEqual(d.downloadLocation, filePathInfo.fullPath))) {
        logger.log("debug", `Download for ${closestMatch.contentEntry.key} already exists (${filePathInfo.fullPath}), skipping`);
        continue;
      }
      if (closestMatch.percentageDiff > 10) {
        logger.log(
          "info",
          `Closest match for ${closestMatch.contentEntry.key} is ${closestMatch.mediaInfo.formatString} but size differs by ${closestMatch.percentageDiff.toFixed(2)}% - skipping`
        );
        continue;
      }
      const { contentEntry, mediaInfo } = closestMatch;
      const { contentInfo } = contentEntry;
      logger.log(
        "info",
        `Adding download for ${contentEntry.key} (${contentInfo.title}) with media format ${mediaInfo.formatString}`
      );
      toAddDownload.push({
        name: contentInfo.key,
        downloadInfo: {
          mediaInfo,
          downloadLocation: filePathInfo.fullPath,
          size: bytesToHumanReadable(fileMatch.fileStats.size),
          downloadDate: fileMatch.fileStats.mtime,
        },
      });
    }

    await this.db.addDownloads(toAddDownload);
    logger.log("info", "Finished scanning for existing files");
    return toAddDownload;
  }

  /**
   * Walks the listing (newest-first) for two things at once, both bounded to
   * automaticDownloads.maxContentAgeHours - content older than that isn't
   * auto-downloadable anyway, so there's no point walking further or
   * re-checking it here:
   * - newContent: keys never seen before.
   * - updatedContent: already-known keys whose live-scraped mediaInfo now
   *   has a format that wasn't stored before - Digital Foundry sometimes
   *   publishes an MP3-only version of a post before the video follows
   *   (e.g. up to an hour later), and the old "stop at the first already-known
   *   item" walk meant that once an entry existed at all (even audio-only),
   *   nothing ever looked at it again - a user who only auto-downloads video
   *   would silently never get it. Detected purely by diffing formatString
   *   sets, so it's zero extra requests - the data's already being fetched.
   */
  /**
   * How many listing pages a single new-content check will walk before
   * giving up. Only reached when an install has been off long enough to
   * miss this much content at once (50 items/page, so 20 pages is roughly a
   * year of DF's output); the usual case stops after one page. Bounded so a
   * near-empty DB can't turn every poll into a full archive walk -
   * scanWholeArchive is the mechanism for that.
   */
  private static readonly MAX_NEW_CONTENT_SCAN_PAGES = 20;

  /**
   * Walks the listing newest-first looking for content this install doesn't
   * already know about, stopping once an entire page turns up nothing new.
   *
   * Deliberately does *not* filter by `automaticDownloads.maxContentAgeHours`.
   * That setting gates whether a discovered item gets auto-downloaded, and
   * checkForNewContents already applies it for that purpose (see its
   * freshEnough/tooOld split). Applying it here as well quietly made it
   * double as a *discovery* limit - pagination stopped at the first page
   * with nothing inside the window - which left a permanent hole: anything
   * that aged past the window before the next poll was never seen here, and
   * scanWholeArchive's tail-only resume (it restarts near its saved
   * checkpoint, at the oldest end of a newest-first listing) never revisits
   * page 0 to catch it either. Content published while the app was off for
   * longer than the window simply never appeared. Discovery is cheap and
   * safe - it only writes content info to the DB; downloading stays gated.
   */
  async getNewContentList(): Promise<{ newContent: DfContentInfo[]; updatedContent: DfContentInfo[] }> {
    const newContent: DfContentInfo[] = [];
    const updatedContent: DfContentInfo[] = [];
    let pagesWalked = 0;
    await forEachListingPage(async (contentInfos, pageIdx) => {
      pagesWalked = pageIdx;
      const existingMeta = await this.db.getContentEntryList(contentInfos.map((contentInfo) => contentInfo.key));
      let anyNewOrUpdated = false;
      contentInfos.forEach((contentInfo, idx) => {
        const existing = existingMeta[idx];
        if (!existing) {
          anyNewOrUpdated = true;
          if (!this.taskManager.hasPipelineForContent(contentInfo.key)) {
            newContent.push(contentInfo);
          }
          return;
        }
        const storedFormats = new Set(existing.contentInfo.mediaInfo.map((mediaInfo) => mediaInfo.formatString));
        if (contentInfo.mediaInfo.some((mediaInfo) => !storedFormats.has(mediaInfo.formatString))) {
          anyNewOrUpdated = true;
          updatedContent.push(contentInfo);
        }
      });
      // The listing is newest-first and the DB fills from that same end, so
      // a page where everything is already known means we've caught up.
      // Keyed on "nothing new anywhere on this page" rather than "the first
      // already-known item" so one already-seen item sitting mid-page
      // doesn't stop the walk while genuinely new content is still below it.
      if (!anyNewOrUpdated) {
        return false;
      }
      return pageIdx < DigitalFoundryContentManager.MAX_NEW_CONTENT_SCAN_PAGES;
    }, { label: "New content check" });
    if (pagesWalked >= DigitalFoundryContentManager.MAX_NEW_CONTENT_SCAN_PAGES) {
      logger.log(
        "warn",
        `New-content check stopped at its ${DigitalFoundryContentManager.MAX_NEW_CONTENT_SCAN_PAGES}-page limit while still finding new content - there is likely more further back that this pass didn't reach. The next check will continue from the newest end again.`
      );
    }
    return { newContent, updatedContent };
  }

  /**
   * Serializes new-content checks against each other. Reached from the poll
   * loop, the sign-in handler and the UI's "Scan for new content now"
   * button, none of which are naturally serialized - and the button in
   * particular makes it trivial to ask for a second check while the first
   * is still walking pages, which would just duplicate every request
   * through the rate-limited queue for no benefit.
   */
  private newContentCheckInProgress = false;

  get newContentCheckRunning() {
    return this.newContentCheckInProgress;
  }

  async checkForNewContents() {
    // Same reasoning as scanWholeArchive/refreshMeta's guards - the poll
    // loop already checks this, but enforcing it here too means a future
    // call site can't reintroduce the same "forgot to gate on sign-in" bug
    // that userTierChanged had.
    if (!this.dfUserManager.isUserSignedIn()) {
      logger.log("info", "Skipping new-content check - not signed in to Digital Foundry");
      return;
    }
    if (this.newContentCheckInProgress) {
      logger.log("info", "Skipping new-content check - one is already running");
      return;
    }
    this.newContentCheckInProgress = true;
    try {
      await this.runNewContentCheck();
    } finally {
      this.newContentCheckInProgress = false;
    }
  }

  private async runNewContentCheck() {
    const noMediaInfoContents = [...this.noMediaContentInfos.values()];
    logger.log(
      "info",
      `Checking for new content${noMediaInfoContents.length
        ? ` and media info for the following media with no media infos: ${noMediaInfoContents
          .map((v) => v.contentInfo.name)
          .join(", ")}`
        : ""
      }`
    );
    const autoDownloadConfig = configService.config.automaticDownloads;
    const mediaFormatsConfig = configService.config.mediaFormats;
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";

    // The listing already returns full content info per item, so no
    // separate detail-fetch step is needed.
    const { newContent, updatedContent } = await this.getNewContentList();
    const newContentInfos = [...newContent, ...updatedContent, ...noMediaInfoContents.map((v) => v.contentInfo)];
    const newContentFetchResults: { contentInfo: DfContentInfo; availability: DfContentAvailability }[] = newContentInfos.map((contentInfo) => ({
      contentInfo,
      availability: contentInfo.mediaInfo.length > 0 ? DfContentAvailability.AVAILABLE : DfContentAvailability.PAYWALLED,
    }));
    const contentToDownload: DfContentInfo[] = newContentInfos;

    const newNoMediaContentInfoMap = new Map<string, { attempts: number; contentInfo: DfContentInfo }>();
    newContentFetchResults.forEach(({ contentInfo }) => {
      if (!contentInfo) {
        return;
      }
      const matchingMediaInfo = getBestMediaInfoMatch(
        mediaFormatsConfig.priorities,
        contentInfo.mediaInfo,
        { mustMatch: true }
      );
      if (!matchingMediaInfo && this.dfUserManager.getCurrentTier()) {
        logger.log("info", `No suitable media info found for ${contentInfo.key}, adding to no media list`);
        const attempts = this.noMediaContentInfos.get(contentInfo.key)?.attempts || 0;
        if (attempts >= 60 * 24) {
          logger.log("info", `Removing ${contentInfo.key} from no media list as it has been there for over 24 hours`);
          return;
        }
        newNoMediaContentInfoMap.set(contentInfo.key, {
          attempts: attempts + 1,
          contentInfo,
        });
      }
    });
    this.noMediaContentInfos = newNoMediaContentInfoMap;

    // Always update content info in DB
    await this.db.setContentInfosWithAvailability(newContentFetchResults, userTier);

    // Guard against auto-downloading everything the very first time this
    // install's automatic scan runs against the post-relaunch site - every
    // piece of content looks "new" relative to a DB that's never been
    // reconciled against the new site before, even for an install that ran
    // yesterday against the old one. See "Resuming after upgrading to this
    // version" in docs/DF_SITE_MIGRATION.md.
    const newSiteFirstScanComplete = await this.db.isNewSiteFirstScanComplete();
    if (!newSiteFirstScanComplete) {
      logger.log(
        "info",
        "First automatic scan against the new Digital Foundry site for this install - suppressing auto-downloads for this pass"
      );
      await this.db.setNewSiteFirstScanComplete(true);
    }

    // Only trigger downloads for content that should be downloaded
    const shouldTriggerDownloads = newSiteFirstScanComplete && autoDownloadConfig.enabled;
    if (shouldTriggerDownloads && contentToDownload.length > 0) {
      // Description is never in Digital Foundry's own listing data (see
      // getOrFetchYtVideoMeta's doc comment) - a description-based
      // exclusion filter would otherwise never match anything for content
      // that hasn't happened to have its detail dialog opened first. Only
      // bother fetching when a configured filter actually checks
      // description - this runs far less often than a scan (once per
      // detected new/updated item, not per page), so the extra YouTube
      // traffic stays bounded, but there's no reason to pay it for users
      // who don't use description filters at all.
      const needsDescriptionForFiltering = autoDownloadConfig.exclusionFilters?.some((filter) => filter.description);
      const filterCandidates = needsDescriptionForFiltering
        ? await Promise.all(
            contentToDownload.map(async (contentInfo) => {
              const enriched = await this.getOrFetchYtVideoMeta(contentInfo.key).catch((e) => {
                logger.log("error", `Failed to fetch YouTube metadata for ${contentInfo.key} while checking exclusion filters`, e);
                return undefined;
              });
              return enriched?.contentInfo || contentInfo;
            })
          )
        : contentToDownload;
      const { include, exclude } = autoDownloadConfig.exclusionFilters?.length
        ? filterContentInfos(autoDownloadConfig.exclusionFilters, filterCandidates, true)
        : { include: filterCandidates, exclude: [] };
      exclude.length &&
        logger.log(
          "info",
          `Ignoring ${exclude.map((contentInfo) => contentInfo.name).join(", ")} due to exclusion filters`
        );
      // Guard against auto-downloading a large batch of "new" content at once
      // (e.g. the first check after an upgrade changes how content is
      // discovered - see docs/DF_SITE_MIGRATION.md). publishedDate comparisons
      // use epoch milliseconds throughout, so this is timezone-safe regardless
      // of where the server or the source data's timestamps come from.
      const maxAgeMs = autoDownloadConfig.maxContentAgeHours * 60 * 60 * 1000;
      const now = Date.now();
      const { include: freshEnough, exclude: tooOld } = include.reduce(
        (acc, contentInfo) => {
          const ageMs = now - contentInfo.publishedDate.getTime();
          (ageMs <= maxAgeMs ? acc.include : acc.exclude).push(contentInfo);
          return acc;
        },
        { include: [] as DfContentInfo[], exclude: [] as DfContentInfo[] }
      );
      tooOld.length &&
        logger.log(
          "info",
          `Not auto-downloading ${tooOld.map((contentInfo) => contentInfo.name).join(", ")} - published more than ${autoDownloadConfig.maxContentAgeHours}h ago`
        );
      for (const content of freshEnough) {
        // Pick a fresh random delay per item so a batch of
        // simultaneously-detected content doesn't all start downloading at
        // the same instant.
        const delayToUse = randomIntInRange(autoDownloadConfig.downloadDelayMinMs, autoDownloadConfig.downloadDelayMaxMs);
        serviceLocator.notifier.newContentDetected(content.title);
        this.downloadContentIn(content, delayToUse, {
          skipIfDownloadingOrDownloaded: true,
        });
      }
    }
  }

  async getUpdateMediaInfo(contentKey: string, titleHint?: string, opts: DfFetchOpts = {}) {
    logger.log("info", `Getting updated media info for ${contentKey}`);
    let resolvedTitleHint = titleHint;
    if (!resolvedTitleHint) {
      const existingEntry = await this.db.getContentEntry(contentKey).catch(() => undefined);
      resolvedTitleHint = existingEntry?.contentInfo?.title;
    }
    const fetchResult = await fetchContentInfo(contentKey, resolvedTitleHint, opts);
    if (!fetchResult) {
      throw new Error(`Failed to get media info for ${contentKey}`);
    }
    const { contentInfo, availability } = fetchResult;
    await this.db.setContentInfosWithAvailability([{ contentInfo, availability }], this.dfUserManager.getCurrentTier() || "NONE");
    return fetchResult || null;
  }

  /**
   * Lazily backfills description/duration from YouTube for a single entry -
   * intended to be called when the user opens the content detail dialog, or
   * before checking an auto-download candidate against description-based
   * exclusion filters - not during scans/refreshes in general. See
   * syncYtVideoMeta's doc comment for the full reasoning (shared with the
   * download-completion chapter-fetch step, which always fetches
   * regardless of caching).
   */
  async getOrFetchYtVideoMeta(contentKey: string): Promise<DfContentEntry | undefined> {
    const result = await syncYtVideoMeta(this.db, contentKey);
    return result?.entry;
  }

  async downloadContentIn(
    content: string | DfContentInfo,
    delay: number,
    opts: {
      skipIfDownloadingOrDownloaded?: boolean;
    } = {}
  ): Promise<void> {
    const { skipIfDownloadingOrDownloaded } = opts;
    const contentKey = typeof content === "string" ? content : content.key;
    const title = typeof content === "string" ? content : content.title;
    return new Promise<void>((resolve, reject) => {
      if (delay) {
        logger.log(
          "info",
          `Queueing download for ${contentKey} ${delay && delay >= 0 ? `in ${delay}ms` : "immediately"}`
        );
        this.scheduledDownloads.set(contentKey, {
          contentKey,
          title,
          scheduledFor: new Date(Date.now() + delay),
        });
      }
      setTimeout(async () => {
        this.scheduledDownloads.delete(contentKey);
        if (skipIfDownloadingOrDownloaded) {
          if (this.taskManager.hasPipelineForContent(contentKey)) {
            logger.log("info", `Skipping download for ${contentKey} as it is already downloading or downloaded`);
            return resolve();
          }
          const contentEntry = await this.db.getContentEntry(contentKey).catch((e) => {
            logger.log(
              "error",
              `Failed to get content entry for ${contentKey} when checking if already downloaded: ${e}`
            );
            return undefined;
          });
          if (contentEntry) {
            // Check per-format, not just "has any download at all" - the
            // format-recheck path (see getNewContentList) re-queues content
            // whose mediaInfo just gained a format that wasn't there before
            // (e.g. video following an earlier audio-only release), and a
            // coarse hasDownload check would wrongly skip that new format
            // just because a different one was already downloaded.
            const matchingMediaInfo =
              typeof content !== "string"
                ? getBestMediaInfoMatch(configService.config.mediaFormats.priorities, content.mediaInfo, { mustMatch: true })
                : undefined;
            const alreadyHasRelevantDownload = matchingMediaInfo
              ? Boolean(DfContentEntryUtils.getDownloadForFormat(contentEntry, matchingMediaInfo.formatString))
              : DfContentEntryUtils.hasDownload(contentEntry);
            if (alreadyHasRelevantDownload) {
              logger.log(
                "info",
                `Skipping download for ${contentKey} as ${matchingMediaInfo ? `the ${matchingMediaInfo.formatString} format is` : "it is"} already downloaded`
              );
              return resolve();
            }
          }
        }
        this.downloadContent(content)
          .then(() => resolve())
          .catch((err) => reject(err));
      }, delay || 0);
    });
  }

  async downloadContent(
    content: string | DfContentInfo,
    {
      mediaFormat,
      interactive = false,
    }: {
      mediaFormat?: string;
      /**
       * True only for a direct, manual "download this" click (see
       * rest/api/tasks.ts's /task endpoint) - never for auto-download.
       * Auto-download can fire several items close together (e.g. a batch
       * detected in one scan cycle, each after its own jittered delay), so
       * bypassing the queue for it risks the exact unspaced-burst pattern
       * the queue exists to prevent; a single manual click is genuinely
       * one-off. Auto-download still gets INTERACTIVE priority either way -
       * it should jump ahead of bulk scan/refresh backlog, just not skip
       * the spacing gate entirely.
       */
      interactive?: boolean;
    } = {}
  ) {
    const mediaFormatsConfig = configService.config.mediaFormats;
    let contentKey: string, contentInfoArg: DfContentInfo | undefined;
    if (typeof content === "string") {
      contentKey = sanitizeContentName(content);
    } else {
      contentKey = content.key;
      contentInfoArg = content;
    }
    // See the `interactive` doc comment above - priority always applies,
    // bypassQueue only for a genuine manual one-off click. Confirmed live
    // 2026-08-18 that priority alone still left a manual download stuck for
    // 5-15s if a scan had just fired a request.
    const updateResult = await this.getUpdateMediaInfo(contentKey, contentInfoArg?.title, {
      priority: DfFetchPriority.INTERACTIVE,
      bypassQueue: interactive,
    }).catch((e) => {
      logger.log(
        "error",
        `Failed to get updated media info for ${contentKey}${contentInfoArg ? " - using existing cached version" : ""
        }: ${e}`
      );
      return null;
    });
    const dfContentInfo = updateResult?.contentInfo || contentInfoArg || (await this.db.getContentEntry(contentKey))?.contentInfo;
    if (!dfContentInfo) {
      throw new Error(`Unable to find content info for ${contentKey}`);
    }
    const mediaInfo =
      (mediaFormat ? dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.formatString === mediaFormat) : undefined) ||
      getBestMediaInfoMatch(mediaFormatsConfig.priorities, dfContentInfo.mediaInfo, {
        mustMatch: true,
      });
    if (!mediaInfo) {
      throw new Error(`Could not get valid media info for ${dfContentInfo.key}`);
    }
    if (updateResult?.availability === DfContentAvailability.PAYWALLED) {
      logger.log("info", `Not downloading ${dfContentInfo.key} as data is paywalled; adding to ignore list`);
      throw new Error(`Content ${dfContentInfo.key} is paywalled`);
    }
    if (dfContentInfo.legacy) {
      // getUpdateMediaInfo() is best-effort (falls back to cached data on
      // failure, just above) - if it couldn't relocate this item live, the
      // mediaInfo we're about to use is unconfirmed and may still point at
      // the old, now-dead CDN. This is defense in depth for the UI's own
      // check (StartDownloadingButton) - auto-download and the manual API
      // endpoint don't go through that button, so guard here too rather
      // than attempting a download that's likely to just fail.
      throw new Error(
        `Content ${dfContentInfo.key} hasn't been confirmed against the current Digital Foundry site yet (legacy) - its download link may not work. Use "refresh metadata" to try to relocate it first.`
      );
    }

    const pipelineExec = this.taskManager
      .downloadContent(dfContentInfo, mediaInfo)
      .on("completed", (pipelineResult) => {
        if (pipelineResult.status === "success") {
          const finalPipelineResult = pipelineResult.pipelineResult;
          const { size, downloadLocation, mediaInfo, subtitles } = finalPipelineResult;
          this.db.contentDownloaded(dfContentInfo.key, {
            mediaInfo,
            downloadDate: new Date(),
            downloadLocation: downloadLocation,
            size: size ? bytesToHumanReadable(size) : undefined,
            subtitles: subtitles
              ? [
                {
                  service: subtitles.service,
                  language: subtitles.language,
                },
              ]
              : undefined,
          });
        }
      });
    return {
      contentKey: dfContentInfo.key,
      mediaInfo: mediaInfo,
      pipelineExec,
    };
  }

  /**
   * Re-checks a list of content keys against current DB state, dropping any
   * that no longer need a live refresh: either the current tier's
   * availability is already known (e.g. a scan wrote it in the meantime), or
   * the entry is `unpatchable` (already given up on - see
   * scanWholeArchive/giveUpOnMetaRefresh; no point burning a request to
   * re-search for something already confirmed absent).
   */
  private async filterStillNeedingMetaRefresh(contentNames: string[]): Promise<string[]> {
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    const entries = await this.db.getContentEntryMap(contentNames);
    return contentNames.filter((contentName) => {
      const entry = entries.get(contentName);
      if (entry?.contentInfo?.unpatchable) {
        return false;
      }
      const existingStatusRecord = entry?.statusInfo?.availabilityInTiers[userTier];
      return !existingStatusRecord || existingStatusRecord === DfContentAvailability.UNKNOWN;
    });
  }

  async userTierChanged(newTier?: string) {
    logger.log("info", `User tier changed to ${newTier}`);
    const userInfo = this.dfUserManager.currentDfUserInfo;
    if (this.dfUserManager.isUserSignedIn() && userInfo) {
      serviceLocator.notifier.userSignedIn(userInfo.username, userInfo.tier);
    } else {
      serviceLocator.notifier.userNotSignedIn();
    }
    if (!newTier) {
      // Signed out (token missing/invalid). Deliberately don't touch stored
      // per-tier availability here at all - the previous version wiped every
      // entry without a cached "NONE" record to UNKNOWN and queued it for
      // refresh, which meant a brief logout/relogin (e.g. pasting a fresh
      // cookie) manufactured a fresh multi-thousand-item refresh backlog on
      // sign-out, then immediately tried to burn through it on sign-in via
      // flushPendingMetaRefresh - on top of racing the archive walk that
      // sign-in also triggers. Leaving existing availability alone means a
      // quick reauth just picks back up with whatever was last known, and a
      // long-term logout (e.g. a week) is fine too - it'll just look stale
      // until the next real tier change or scan refreshes it, rather than
      // firing any requests while we can't authenticate anyway (refreshMeta/
      // scanWholeArchive both hard no-op while signed out regardless, this
      // just avoids the pointless bookkeeping on the way there).
      return;
    }
    const allContentStatuses = await this.db.getAllContentStatusInfos();
    const toRefresh: string[] = [];
    for (const [contentName, contentStatus] of Object.entries(allContentStatuses)) {
      const existingStatusRecord = contentStatus.availabilityInTiers[newTier];
      if (existingStatusRecord && existingStatusRecord !== DfContentAvailability.UNKNOWN) {
        logger.log("info", `Existing content availability for ${contentName} - setting to ${existingStatusRecord}`);
        contentStatus.availability = existingStatusRecord;
      } else {
        contentStatus.availability = DfContentAvailability.UNKNOWN;
        toRefresh.push(contentName);
      }
    }
    await this.db.setContentStatuses(allContentStatuses);
    if (toRefresh.length === 0) {
      return;
    }
    if (this.startupScanComplete && this.metaFetchesInProgress === 0) {
      await this.refreshMeta(toRefresh);
    } else {
      // Either the startup sequence hasn't finished yet, or a scan (initial
      // or re-triggered by configUpdated:digitalFoundry) is currently using
      // the same rate-limited request queue - don't compete with it. See
      // flushPendingMetaRefresh's callers; both the startup sequence and the
      // configUpdated:digitalFoundry "just signed in" path flush this once
      // their scan finishes. Confirmed live 2026-08-18: checkDfUserInfo()
      // fires this listener as an un-awaited side effect, so it can race a
      // scan triggered by the very same auth-status check, not just at
      // startup - startupScanComplete alone only guarded the one-time
      // startup window.
      toRefresh.forEach((contentName) => this.pendingStartupMetaRefresh.add(contentName));
    }
  }

  async deleteDownload(contentEntry: DfContentEntry, downloadLocation: string) {
    if (!contentEntry.downloads.find((d) => pathIsEqual(d.downloadLocation, downloadLocation))) {
      throw new Error(`Download not found for content ${contentEntry.key}`);
    }
    const downloadExists = await fileExists(downloadLocation);
    if (downloadExists) {
      const deleted = await deleteFile(downloadLocation);
      if (!deleted) {
        throw new Error(`Failed to delete file ${downloadLocation}`);
      }
    } else {
      logger.log(
        "info",
        `Download ${downloadLocation} for ${contentEntry.key} does not exist, removing from database`
      );
    }
    await this.db.removeDownload(contentEntry.key, downloadLocation);
  }

  get currentFetchQueueSize() {
    return dfFetchWorkerQueue.getQueueSize();
  }

  get scanInProgress() {
    return this.metaFetchesInProgress > 0 || this.currentFetchQueueSize > 0;
  }

  /**
   * Whether there's a confirmed, subscribed Digital Foundry session. Every
   * scan/refresh path hard no-ops without one, so the UI needs this to
   * explain why an action is unavailable rather than appearing to do
   * nothing.
   */
  get signedInToDf() {
    return this.dfUserManager.isUserSignedIn();
  }

  getScheduledDownloads(): ScheduledDownloadInfo[] {
    return Array.from(this.scheduledDownloads.values());
  }

  async getFileMoveList(template: string) {
    const allContentEntries = await this.db.getAllContentEntries();
    return getFileMoveList(allContentEntries, template);
  }

  async downloadManualContent(manualRequest: ManualDownloadRequest) {
    const mediaFormatsConfig = configService.config.mediaFormats;

    // name is a pretty, filename-safe slug derived from the title (cosmetic
    // only); key is the stable internal identity used for DB/dedup lookups -
    // prefer the YouTube ID when the user supplied one, same scheme as the
    // site fetcher, otherwise fall back to a slug-derived key (as fragile as
    // the old name-as-key scheme, but manual entries have no other stable ID).
    const name = slugifyTitle(manualRequest.title);
    const youtubeVideoId = manualRequest.youtubeUrl
      ? manualRequest.youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1]
      : undefined;
    const key = youtubeVideoId ? `yt-${youtubeVideoId}` : `manual-${name}-manual-download`;

    // Create MediaInfo for this download
    const newMediaInfo: MediaInfo = {
      type: "VIDEO",
      formatString: manualRequest.mediaFormat || "Manual",
      encoding: "Unknown",
      size: undefined, // Will be determined during download
      videoProperties: null,
      audioProperties: null,
      mediaFilename: undefined // Will be determined during download
    };

    // Check if content with this key already exists
    const existingContentEntry = await this.db.getContentEntry(key);

    let dfContentInfo: DfContentInfo;

    if (existingContentEntry) {
      // Content exists - append new media info if format doesn't already exist
      const existingContentInfo = existingContentEntry.contentInfo;
      const existingFormat = existingContentInfo.mediaInfo.find((info: MediaInfo) => info.formatString === newMediaInfo.formatString);
      if (existingFormat) {
        throw new Error(`Media format "${newMediaInfo.formatString}" already exists for content "${manualRequest.title}"`);
      }

      // Add new media info to existing content
      dfContentInfo = {
        ...existingContentInfo,
        mediaInfo: [...existingContentInfo.mediaInfo, newMediaInfo]
      };

      // Update the existing content in database
      await this.db.setContentInfo(dfContentInfo);
    } else {
      // Create new content entry
      dfContentInfo = {
        key,
        name,
        dataVersion: CURRENT_DATA_VERSION,
        title: manualRequest.title,
        description: manualRequest.description,
        publishedDate: manualRequest.publishedDate ? new Date(manualRequest.publishedDate) : new Date(),
        tags: manualRequest.tags,
        youtubeVideoId,
        thumbnailUrl: undefined,
        mediaInfo: [newMediaInfo],
        source: "manual",
        legacy: false,
        unpatchable: false,
      };

      // Store the new content info in the database
      await this.db.setContentInfo(dfContentInfo);
    }

    const selectedMediaInfo = manualRequest.mediaFormat
      ? dfContentInfo.mediaInfo.find(info => info.formatString === manualRequest.mediaFormat)
      : getBestMediaInfoMatch(mediaFormatsConfig.priorities, dfContentInfo.mediaInfo, { mustMatch: true });

    if (!selectedMediaInfo) {
      throw new Error(`Could not get valid media info for manual download: ${dfContentInfo.key}`);
    }

    const pipelineExec = this.taskManager
      .downloadContent(dfContentInfo, selectedMediaInfo, manualRequest.url)
      .on("completed", (pipelineResult) => {
        if (pipelineResult.status === "success") {
          const finalPipelineResult = pipelineResult.pipelineResult;
          const { size, downloadLocation, mediaInfo, subtitles } = finalPipelineResult;
          this.db.contentDownloaded(dfContentInfo.key, {
            mediaInfo,
            downloadDate: new Date(),
            downloadLocation: downloadLocation,
            size: size ? `${size / 1024 / 1024} MB` : undefined,
            subtitles: subtitles ? [subtitles] : undefined,
          });
          logger.log("info", `Manual download completed for ${dfContentInfo.key}`);
        } else {
          let errorMsg = "Pipeline was cancelled or failed";
          if (pipelineResult.status === "failed") {
            errorMsg = (pipelineResult as any).error || "Pipeline failed with unknown error";
          }
          logger.log("error", `Manual download failed for ${dfContentInfo.key}: ${errorMsg}`);
        }
      });

    return {
      contentKey: dfContentInfo.key,
      mediaInfo: selectedMediaInfo,
      pipelineExec,
    };
  }

}
