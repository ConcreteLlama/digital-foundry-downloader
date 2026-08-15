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
import { forEachListingPage, fetchContentInfo } from "./df-fetcher.js";
import { DfTaskManager } from "./df-task-manager.js";
import { DfUserManager } from "./df-user-manager.js";
import { serviceLocator } from "./services/service-locator.js";
import { findExistingContent } from "./utils/content-finder.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { deleteFile, ensureDirectory, fileExists, pathIsEqual } from "./utils/file-utils.js";
import { dfFetchWorkerQueue } from "./utils/queue-utils.js";
import { getFileMoveList } from "./utils/template-utils.js";

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
      await this.scanWholeArchive(...newContentList.map((contentRef) => contentRef.key));
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
    if (this.pendingStartupMetaRefresh.size > 0) {
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
          `Initial scan complete - refreshing metadata for ${stillPending.length} of ${pending.length} deferred entries (the rest were already resolved by the scan)`
        );
        await this.refreshMeta(...stillPending);
      }
    }
    if (contentManagementConfig.scanForExistingFiles) {
      const scanTask = this.taskManager.scanForExistingContent(this);
      await scanTask.awaitResult();
    }
    configService.on("configUpdated:digitalFoundry", async ({ oldValue, newValue }) => {
      if (newValue.sessionId === oldValue.sessionId) {
        return;
      }
      const wasSignedIn = this.dfUserManager.isUserSignedIn();
      await this.dfUserManager.checkDfUserInfo();
      if (!wasSignedIn && this.dfUserManager.isUserSignedIn()) {
        logger.log("info", "Digital Foundry authentication configured - starting archive scan");
        await this.runInitialScan();
      }
    });
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
        { offset: startOffset, limit: DigitalFoundryContentManager.ARCHIVE_SCAN_PAGE_LIMIT }
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
    await this.refreshMeta(...requiringUpdate.map((contentEntry) => contentEntry.key));
  }

  async refreshMeta(...contentNames: string[]) {
    const refreshedMetaKeys = new Set<string>();
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    try {
      this.metaFetchesInProgress++;
      while (contentNames.length > 0) {
        const entryBatch = contentNames.splice(0, 10);
        const contentInfoResults = await Promise.allSettled(
          entryBatch.map((contentName) =>
            dfFetchWorkerQueue.addWork(async () => {
              // The new site has no per-item lookup endpoint - fetchContentInfo
              // does a best-effort title search, so give it whatever title we
              // already have on record for this entry.
              const existingEntry = await this.db.getContentEntry(contentName).catch(() => undefined);
              logger.log("info", `${contentName} has out of date meta; fetching info and patching`);
              return fetchContentInfo(contentName, existingEntry?.contentInfo?.title);
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

  async getNewContentList(): Promise<DfContentInfo[]> {
    const toReturn: DfContentInfo[] = [];
    await forEachListingPage(async (contentInfos) => {
      const existingMeta = await this.db.getContentEntryList(contentInfos.map((contentInfo) => contentInfo.key));
      const newContentInfos = contentInfos.filter(
        (value, idx) => !existingMeta[idx] && !this.taskManager.hasPipelineForContent(value.key)
      );
      if (newContentInfos.length === 0) {
        return false;
      }
      toReturn.push(...newContentInfos);
      return newContentInfos.length === contentInfos.length;
    });
    return toReturn;
  }

  async checkForNewContents(opts?: {
    triggerDownloads?: boolean;
    providedContentInfos?: DfContentInfo[];
    downloadDelay?: number;
  }) {
    const { triggerDownloads, providedContentInfos, downloadDelay } = opts || {};
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

    let newContentFetchResults: { contentInfo: DfContentInfo; availability: DfContentAvailability }[];
    let contentToDownload: DfContentInfo[] = [];

    if (providedContentInfos) {
      // Use provided content infos, handle both new and existing content
      const existingContentEntries = await this.db.getAllContentEntries();
      const existingContentMap = new Map(existingContentEntries.map(c => [c.key, c]));

      // Always update all provided content in DB
      newContentFetchResults = providedContentInfos.map(contentInfo => ({
        contentInfo,
        availability: DfContentAvailability.AVAILABLE
      }));

      // Determine which content should trigger downloads
      for (const contentInfo of providedContentInfos) {
        const existingEntry = existingContentMap.get(contentInfo.key);
        if (!existingEntry) {
          // New content - should download
          contentToDownload.push(contentInfo);
        } else if (!existingEntry.downloads || existingEntry.downloads.length === 0) {
          // Existing content with no downloads - should download
          contentToDownload.push(contentInfo);
        }
        // Existing content with downloads - skip (will be updated but not re-downloaded)
      }
    } else {
      // Fetch from DF site as usual - the listing already returns full content
      // info, so no separate detail-fetch step is needed.
      const newContentInfos = [...(await this.getNewContentList()), ...noMediaInfoContents.map((v) => v.contentInfo)];
      newContentFetchResults = newContentInfos.map((contentInfo) => ({
        contentInfo,
        availability: contentInfo.mediaInfo.length > 0 ? DfContentAvailability.AVAILABLE : DfContentAvailability.PAYWALLED,
      }));
      contentToDownload = newContentInfos;
    }
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
      if (!matchingMediaInfo && this.dfUserManager.getCurrentTier() && !providedContentInfos) {
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
    // yesterday against the old one. Only relevant to the real automatic-scan
    // path; providedContentInfos (manual/Patreon-import) is always an
    // explicit, user-initiated trigger. See "Resuming after upgrading to this
    // version" in docs/DF_SITE_MIGRATION.md.
    const isAutomaticScan = !providedContentInfos;
    const newSiteFirstScanComplete = isAutomaticScan ? await this.db.isNewSiteFirstScanComplete() : true;
    if (isAutomaticScan && !newSiteFirstScanComplete) {
      logger.log(
        "info",
        "First automatic scan against the new Digital Foundry site for this install - suppressing auto-downloads for this pass"
      );
      await this.db.setNewSiteFirstScanComplete(true);
    }

    // Only trigger downloads for content that should be downloaded
    const shouldTriggerDownloads =
      newSiteFirstScanComplete && (triggerDownloads !== undefined ? triggerDownloads : autoDownloadConfig.enabled);
    if (shouldTriggerDownloads && contentToDownload.length > 0) {
      const { include, exclude } = autoDownloadConfig.exclusionFilters?.length
        ? filterContentInfos(autoDownloadConfig.exclusionFilters, contentToDownload, true)
        : { include: contentToDownload, exclude: [] };
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
        // downloadDelay (the opts override) is an explicit "start immediately"
        // escape hatch for manual/Patreon-import triggers - only randomize
        // within the configured range for real automatic detections, and pick
        // a fresh value per item so a batch of simultaneously-detected content
        // doesn't all start at once either.
        const delayToUse =
          downloadDelay !== undefined
            ? downloadDelay
            : randomIntInRange(autoDownloadConfig.downloadDelayMinMs, autoDownloadConfig.downloadDelayMaxMs);
        serviceLocator.notifier.newContentDetected(content.title);
        this.downloadContentIn(content, delayToUse, {
          skipIfDownloadingOrDownloaded: true,
        });
      }
    }
  }

  async getUpdateMediaInfo(contentKey: string, titleHint?: string) {
    logger.log("info", `Getting updated media info for ${contentKey}`);
    let resolvedTitleHint = titleHint;
    if (!resolvedTitleHint) {
      const existingEntry = await this.db.getContentEntry(contentKey).catch(() => undefined);
      resolvedTitleHint = existingEntry?.contentInfo?.title;
    }
    const fetchResult = await fetchContentInfo(contentKey, resolvedTitleHint);
    if (!fetchResult) {
      throw new Error(`Failed to get media info for ${contentKey}`);
    }
    const { contentInfo, availability } = fetchResult;
    await this.db.setContentInfosWithAvailability([{ contentInfo, availability }], this.dfUserManager.getCurrentTier() || "NONE");
    return fetchResult || null;
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
          if (contentEntry && DfContentEntryUtils.hasDownload(contentEntry)) {
            logger.log("info", `Skipping download for ${contentKey} as it is already downloaded`);
            return resolve();
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
    }: {
      mediaFormat?: string;
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
    const updateResult = await this.getUpdateMediaInfo(contentKey, contentInfoArg?.title).catch((e) => {
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
    const newTierStr = newTier || 'NONE';
    const allContentStatuses = await this.db.getAllContentStatusInfos();
    const toRefresh: string[] = [];
    for (const [contentName, contentStatus] of Object.entries(allContentStatuses)) {
      const existingStatusRecord = contentStatus.availabilityInTiers[newTierStr];
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
    if (this.startupScanComplete) {
      await this.refreshMeta(...toRefresh);
    } else {
      // The initial startup scan is still running (or hasn't started yet) -
      // don't compete with it for the same rate-limited request queue. See
      // pendingStartupMetaRefresh's doc comment; start() flushes this once
      // the scan finishes.
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
