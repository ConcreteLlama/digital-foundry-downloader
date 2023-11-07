import Queue from "better-queue";
import { Stats } from "fs";
import fs from "fs/promises";
import prettyBytes from "pretty-bytes";
import { DbInitInfo, DfDownloaderOperationalDb, makeDownloadedContentInfo } from "./db/df-operational-db.js";
import { DfContentInfoReference, downloadMedia, forEachArchivePage, getMediaInfo } from "./df-fetcher.js";
import { DfMetaInjector } from "./df-mpeg-meta.js";
import { DfNotificationConsumer } from "./notifiers/notification-consumer.js";
import {
  DfContentInfo,
  MediaInfo,
  QueuedContentStatus,
  DownloadProgressInfo,
  DfContentEntry,
  DfContentStatusInfoPaywalled,
  QueuedContent,
  DfContentInfoUtils,
  QueuedContentUtils,
  DfContentStatus,
  filterContentInfos,
  asyncSome,
  transformFirst,
} from "df-downloader-common";
import { DfUserManager } from "./df-user-manager.js";
import { DownloadState } from "./utils/downloader.js";
import { logger } from "df-downloader-common";
import { sanitizeContentName } from "./utils/df-utils.js";
import { ensureDirectory, extractFilenameFromUrl, fileSizeStringToBytes, moveFile } from "./utils/file-utils.js";
import { dfFetchWorkerQueue, fileScannerQueue } from "./utils/queue-utils.js";
import { serviceLocator } from "./services/service-locator.js";
import { getMostImportantItem } from "./utils/importance-list.js";
import { configService } from "./config/config.js";

type DownloadQueueItem = {
  dfContentInfo: DfContentInfo;
  mediaInfo: MediaInfo;
};

// TODO: Refactor this so that we have a separate class for the queue and the content manager
// The queue takes the content manager in the constructor
// Should have multiple queues - either:
// - One for downloads and one for post processing or
// - One for downloads and one for each post processing step (preferred)
// Need something above the queues that manages the state of the queued items - when one step is done, it can move the item to the next queue

export class DigitalFoundryContentManager {
  private dfMetaInjector: DfMetaInjector;
  private dfUserManager: DfUserManager;
  queuedContent: Map<string, QueuedContent> = new Map<string, QueuedContent>();
  metaFetchesInProgress: number = 0;

  workQueue: Queue<DownloadQueueItem, any>;

  constructor(readonly db: DfDownloaderOperationalDb) {
    this.dfMetaInjector = new DfMetaInjector();
    this.dfUserManager = new DfUserManager(db);
    this.dfUserManager.addUserTierChangeListener((tier) => this.userTierChanged(tier));
    const downloadsConfig = configService.config.downloads;
    this.workQueue = new Queue<DownloadQueueItem, any>(
      async (queueItem: DownloadQueueItem, cb) => {
        const { dfContentInfo, mediaInfo } = queueItem;
        const config = configService.config;
        const contentManagementConfig = config.contentManagement;
        const metaConfig = config.metadata;
        const pendingInfo = this.queuedContent.get(dfContentInfo.name)!;
        pendingInfo.queuedContentStatus = QueuedContentStatus.DOWNLOADING;
        let err: any;
        try {
          logger.log("debug", `Fetching ${JSON.stringify(dfContentInfo)}`);
          logger.log("debug", "Fetching", mediaInfo, "from list", dfContentInfo.mediaInfo);
          logger.log("info", `Fetching ${dfContentInfo.name} with media type ${mediaInfo.mediaType}`);
          let currentProgress: DownloadProgressInfo;
          try {
            serviceLocator.notificationConsumers.forEach((consumer) =>
              consumer.downloadStarting(dfContentInfo, mediaInfo)
            );
            const downloadResult = await downloadMedia(
              dfContentInfo,
              mediaInfo,
              (progressUpdate: DownloadProgressInfo) => {
                progressUpdate && (currentProgress = progressUpdate);
                pendingInfo.currentProgress = currentProgress;
                this.progressUpdate(dfContentInfo, mediaInfo, progressUpdate);
              }
            );
            pendingInfo.currentProgress = undefined;
            if (!downloadResult) {
              err = `Unable to download ${dfContentInfo.name}`;
              return;
            }
            if (downloadResult.status === DownloadState.STOPPED) {
              logger.log("info", `Download for ${dfContentInfo.name} was manually stopped`);
              return;
            }
            if (downloadResult.status === DownloadState.FAILED) {
              err = downloadResult.error;
              return;
            }
            pendingInfo.queuedContentStatus = QueuedContentStatus.POST_PROCESSING;
            const downloadLocation = downloadResult.destination;
            if (metaConfig.injectMetadata) {
              pendingInfo.statusInfo = "Injecting metadata";
              try {
                await this.dfMetaInjector.setMeta(downloadLocation, dfContentInfo);
                logger.log("debug", `Set meta for ${dfContentInfo.name}`);
              } catch (e) {
                logger.log("error", `Unable to inject metadata for ${dfContentInfo.name} - continuing anyway`, e);
              }
            }
            const subtitleGenerator = serviceLocator.subtitleGenerator;
            if (subtitleGenerator) {
              try {
                pendingInfo.statusInfo = "Fetching subtitles";
                const subInfo = await subtitleGenerator.getSubs(downloadLocation, "eng");
                pendingInfo.statusInfo = "Injecting subtitles";
                await this.dfMetaInjector.injectSubs(downloadLocation, subInfo);
              } catch (e) {
                logger.log("error", `Unable to get subs for ${dfContentInfo.name} - continuing anyway`, e);
              }
            }

            const filename = DfContentInfoUtils.makeFileName(dfContentInfo, mediaInfo);
            const destination = `${contentManagementConfig.destinationDir}/${filename}`;

            if (downloadLocation !== destination) {
              logger.log(
                "debug",
                `Destination dir and download dir are not the same, moving ${downloadLocation} to ${destination}`
              );
              pendingInfo!.queuedContentStatus = QueuedContentStatus.POST_PROCESSING;
              pendingInfo.statusInfo = "Moving file";

              await moveFile(downloadLocation, destination, {
                clobber: true,
              }).catch((e) => logger.log("debug", e));
              logger.log("debug", `File moved from ${downloadLocation} to ${destination}`);
            }
            await this.dfMetaInjector.setDate(destination, dfContentInfo.publishedDate);
            await this.db.contentDownloaded(
              dfContentInfo,
              mediaInfo.mediaType,
              destination,
              mediaInfo.size,
              new Date()
            );
            pendingInfo!.queuedContentStatus = QueuedContentStatus.DONE;
            this.queuedContent.delete(dfContentInfo.name);

            serviceLocator.notificationConsumers.forEach((consumer) =>
              consumer.downloadComplete(dfContentInfo, mediaInfo, destination, downloadResult.stats)
            );
          } catch (e) {
            err = e;
          }
        } catch (e) {
          err = e;
        } finally {
          if (err) {
            pendingInfo!.queuedContentStatus = QueuedContentStatus.PENDING_RETRY;
            logger.log("warn", `Unable to fetch ${dfContentInfo.name}`);
            logger.log("warn", err);
            serviceLocator.notificationConsumers.forEach((consumer) => consumer.downloadFailed(dfContentInfo, err));
            this.setupRetry(dfContentInfo.name);
          }
          cb();
        }
      },
      {
        concurrent: downloadsConfig.maxSimultaneousDownloads,
        priority: ({ dfContentInfo }: DownloadQueueItem, cb) => {
          return cb(null, dfContentInfo.publishedDate.getTime());
        },
      }
    );
    configService.on("configUpdated:downloads", ({ newValue }) => {
      logger.log(
        "info",
        `TODO: Write logic to max simultaneous downloads to ${newValue.maxSimultaneousDownloads} on the fly`
      );
    });
    configService.on("configUpdated:contentManagement", ({ newValue, oldValue }) => {
      if (newValue.destinationDir !== oldValue.destinationDir) {
        ensureDirectory(newValue.destinationDir);
        this.scanForExistingFiles();
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

  async start(dbInitInfo: DbInitInfo) {
    ensureDirectory(configService.config.contentManagement.destinationDir);
    ensureDirectory(configService.config.contentManagement.workDir);
    const contentManagementConfig = configService.config.contentManagement;
    const contentDetectionConfig = configService.config.contentDetection;
    //TODO: Queue all downloads in "ATTEMPTING_DOWNLOAD" state
    await this.dfUserManager.start();
    if (dbInitInfo.firstRun) {
      await this.scanWholeArchive();
    } else {
      const newContentList = await this.getNewContentList();
      // Skip new content list when scanning whole archive so we don't ignore it.
      await this.scanWholeArchive(...newContentList.map((contentRef) => contentRef.name));
      await this.patchMetas();
    }
    if (contentManagementConfig.scanForExistingFiles) {
      await this.scanForExistingFiles();
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

  async scanWholeArchive(...ignoreList: string[]) {
    try {
      this.metaFetchesInProgress++;
      const contentDetectionConfig = configService.config.contentDetection;
      logger.log("info", `Scanning whole archive`);
      await forEachArchivePage(
        async (contentList) => {
          //We may not have finished completing our first run last time so we should filter the content list
          ignoreList && (contentList = contentList.filter((contentRef) => !ignoreList.includes(contentRef.name)));
          const existingContentInfos = await this.db.getContentInfoMap(
            contentList.map((contentInfo) => contentInfo.name)
          );
          contentList = contentList.filter((content) => {
            const existing = existingContentInfos.get(content.name);
            return !(existing && existing.contentInfo);
          });
          const contentMetas = await Promise.all(
            contentList.map((contentRef) =>
              dfFetchWorkerQueue.addWork(() => {
                logger.log("info", `Fetching meta for ${JSON.stringify(contentRef.title)} then adding to ignore list`);
                return getMediaInfo(sanitizeContentName(contentRef.link));
              })
            )
          );
          if (contentMetas.length > 0) {
            await this.db.addContents(this.dfUserManager.getCurrentTier() || "NONE", contentMetas);
          }
          return true;
        },
        1,
        contentDetectionConfig.maxArchivePage
      );
      await this.db.setFirstRunComplete();
    } finally {
      this.metaFetchesInProgress--;
    }
    logger.log("info", `Finished scanning whole archive`);
  }

  async patchMetas() {
    const contentEntries = await this.db.getAllContentEntries();
    const requiringMetaRefresh = new Set<string>();
    for (const contentEntry of contentEntries) {
      if (!contentEntry.contentInfo) {
        logger.log("debug", `Content entry ${contentEntry.name} has no meta, skipping`);
        continue;
      }
      let updatesMade = false;
      if (!contentEntry.contentInfo.mediaInfo?.length && this.dfUserManager.getCurrentTier()) {
        logger.log(
          "info",
          `Media info for https://www.digitalfoundry.net/${contentEntry.name} contains no entries but we have a user tier, adding to update list`
        );
        requiringMetaRefresh.add(contentEntry.name);
        continue;
      } else {
        contentEntry.contentInfo.mediaInfo = contentEntry.contentInfo.mediaInfo.filter((mediaInfo) => {
          try {
            fileSizeStringToBytes(mediaInfo.size || "None");
          } catch (e) {
            logger.log(
              "info",
              `Media info for https://www.digitalfoundry.net/${contentEntry.name} contains invalid entry with unparseable size field, setting to 0`
            );
            mediaInfo.size = "0";
            updatesMade = true;
          }
          if (mediaInfo.url) {
            const urlFilename = mediaInfo.url ? extractFilenameFromUrl(mediaInfo.url) : null;
            if (!Boolean(urlFilename?.trim()?.length)) {
              logger.log(
                "info",
                `Media info for https://www.digitalfoundry.net/${contentEntry.name} contains invalid entry with URL that doesn't contain a file path, removing`
              );
              updatesMade = true;
              return false;
            }
          } else if (this.dfUserManager.getCurrentTier()) {
            requiringMetaRefresh.add(contentEntry.name);
          }
          return true;
        });
      }
      if (updatesMade) {
        await this.db.addContentInfos(contentEntry);
      }
    }
    const requiringUpdate = contentEntries.filter(
      (contentEntry) => !contentEntry.contentInfo || contentEntry.dataVersion !== "2.0.0" || requiringMetaRefresh.has(contentEntry.name)
    ).sort((a, b) => b.contentInfo?.publishedDate.getTime() - a.contentInfo?.publishedDate.getTime());
    if (requiringUpdate.length === 0) {
      logger.log("info", "No content entries require meta patching");
      return;
    }
    try {
      this.metaFetchesInProgress++;
      while (requiringUpdate.length > 0) {
        const entryBatch = requiringUpdate.splice(0, 10);
        const contentInfoResults = await Promise.allSettled(
          entryBatch.map((contentInfo) =>
            dfFetchWorkerQueue.addWork(() => {
              logger.log("info", `${contentInfo.name} has out of date meta; fetching info and patching`);
              return getMediaInfo(contentInfo.name);
            })
          )
        );
        const toUpdate: DfContentEntry[] = [];
        contentInfoResults.forEach((result, idx) => {
          if (result.status === "rejected") {
            logger.log("error", `Failed to fetch meta for ${entryBatch[idx].name} ${result.reason}`);
          } else {
            logger.log("info", `Successfully fetched meta for ${result.value.name}`);
            const contentEntry = entryBatch[idx];
            contentEntry.contentInfo = result.value;
            contentEntry.dataVersion = "2.0.0";
            toUpdate.push(contentEntry);
          }
        });
        await this.db.addContentInfos(...toUpdate);
      }
    } finally {
      this.metaFetchesInProgress--;
    }
  }

  async scanForExistingFiles() {
    const contentManagementConfig = configService.config.contentManagement;
    const contentEntries = await this.db.getAllContentEntries();

    const notDownloaded = contentEntries.filter((contentEntry) => contentEntry.statusInfo.status !== "DOWNLOADED");
    logger.log("info", "Scanning for existing files");
    while (notDownloaded.length > 0) {
      const toCheck = notDownloaded.splice(0, 50);
      let toUpdate: DfContentEntry[] = [];
      await Promise.all(
        toCheck.map(async (contentEntry) => {
          const { contentInfo } = contentEntry;
          const fileMatch = await transformFirst(contentInfo.mediaInfo, async (mediaInfo) => {
            const dfDownloaderFilename = DfContentInfoUtils.makeFileName(contentInfo, mediaInfo);
            const filenames = [
              `${contentManagementConfig.destinationDir}/${dfDownloaderFilename}`,
            ];
            mediaInfo.url && filenames.push(extractFilenameFromUrl(mediaInfo.url));
            for (const contentFilename of filenames) {
              try {
                await fileScannerQueue.addWork(() => fs.access(contentFilename));
                const fileInfo = await fileScannerQueue.addWork(() => fs.stat(contentFilename));
                if (!fileInfo) {
                  continue;
                }
                return {
                  matchingFileName: contentFilename,
                  matchingFileStats: fileInfo,
                };
              } catch (e) {
                // File not found, continue loop
              }
            }
            return false;
          });
          if (fileMatch) {
            const { matchingFileName, matchingFileStats } = fileMatch;
            const matchingMediaInfos: [
              MediaInfo,
              number
            ][] = contentInfo.mediaInfo.map((mediaInfo) => {
                try {
                  const sizeDifference = Math.abs(fileSizeStringToBytes(mediaInfo.size || "0") - matchingFileStats.size);
                  return [mediaInfo, sizeDifference];
                } catch (e: any) {
                  return [mediaInfo, -1];
                }
              });
            const bestMatch = matchingMediaInfos.sort(([, a], [, b]) => a - b)[0][0];
            toUpdate.push(
              makeDownloadedContentInfo(
                contentEntry.contentInfo,
                bestMatch.mediaType,
                matchingFileName,
                prettyBytes(matchingFileStats.size),
                matchingFileStats.birthtime
              )
            );
          }
        })
      );
      await this.db.addContentInfos(...toUpdate);
    }

    logger.log("info", "Finished scanning for existing files");
  }

  async getNewContentList() {
    const toReturn: DfContentInfoReference[] = [];
    await forEachArchivePage(async (contentList) => {
      const existingMeta = await this.db.getContentEntryList(contentList.map((contentRef) => contentRef.name));
      const newContentInfos = contentList.filter(
        (value, idx) =>
          (!existingMeta[idx] || existingMeta[idx]?.statusInfo.status === "ATTEMPTING_DOWNLOAD") &&
          !this.queuedContent.has(value.name)
      );
      if (newContentInfos.length === 0) {
        return false;
      }
      toReturn.push(...newContentInfos);
      return newContentInfos.length === contentList.length;
    });
    return toReturn;
  }

  async getContentInfos(dfContentReferences: DfContentInfoReference[]) {
    return await Promise.all(
      dfContentReferences.map((contentInfo) =>
        dfFetchWorkerQueue.addWork(() => {
          return getMediaInfo(contentInfo.name);
        })
      )
    );
  }

  async checkForNewContents() {
    const autoDownloadConfig = configService.config.automaticDownloads;
    const newContentRefs = await this.getNewContentList();
    const newContentInfos = await this.getContentInfos(newContentRefs);
    if (autoDownloadConfig.enabled) {
      const { include, exclude } = autoDownloadConfig.exclusionFilters?.length
        ? filterContentInfos(autoDownloadConfig.exclusionFilters, newContentInfos, true)
        : { include: newContentInfos, exclude: [] };
      exclude.length &&
        logger.log(
          "info",
          `Ignoring ${exclude.map((contentInfo) => contentInfo.name).join(", ")} due to exclusion filters`
        );
      await this.db.addAvailableContent(exclude);
      await this.db.addDownloadingContents(include);
      for (const content of include) {
        serviceLocator.notificationConsumers.forEach((consumer) => consumer.newContentDetected(content.title));
        this.getContent(content, {
          delay: autoDownloadConfig.downloadDelay,
        });
      }
    } else {
      await this.db.addAvailableContent(newContentInfos);
    }
  }

  async getMediaInfo(contentName: string) {
    return await getMediaInfo(contentName);
  }

  async getContent(
    content: string | DfContentInfo,
    {
      delay,
      mediaType,
    }: {
      delay?: number;
      mediaType?: string;
    } = {}
  ) {
    const autoDownloadConfig = configService.config.automaticDownloads;
    const downloadConfig = configService.config.downloads;
    let contentName: string, contentInfoArg: DfContentInfo | undefined;
    if (typeof content === "string") {
      contentName = sanitizeContentName(content);
    } else {
      contentName = content.name;
      contentInfoArg = content;
    }
    let queuedContentInfo = this.queuedContent.get(contentName);
    const dfContentInfo = contentInfoArg || queuedContentInfo?.dfContent || (await this.getMediaInfo(contentName));
    if (!dfContentInfo) {
      throw new Error(`Unable to find content info for ${contentName}`);
    }
    const mediaInfo =
      queuedContentInfo?.selectedMediaInfo ||
      (mediaType ? dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.mediaType === mediaType) : undefined) ||
      getMostImportantItem(autoDownloadConfig.mediaTypes, dfContentInfo.mediaInfo, (mediaInfo) => mediaInfo.mediaType);
    if (!mediaInfo) {
      throw new Error(`Could not get valid media info for ${dfContentInfo.name}`);
    }
    if (queuedContentInfo) {
      if (!queuedContentInfo.readyForRetry) {
        throw new Error(`Already downloading ${queuedContentInfo}`);
      }
      QueuedContentUtils.newAttempt(queuedContentInfo);
    } else {
      queuedContentInfo = QueuedContentUtils.create(
        contentName,
        downloadConfig.failureRetryIntervalBase,
        new Date(),
        dfContentInfo,
        mediaInfo
      );
      this.queuedContent.set(contentName, queuedContentInfo);
    }
    if (dfContentInfo.dataPaywalled) {
      logger.log("info", `Not downloading ${dfContentInfo.name} as data is paywalled; adding to ignore list`);
      this.db.addPaywalledContent(this.dfUserManager.getCurrentTier() || "NONE", dfContentInfo);
      return;
    }
    if (delay) {
      logger.log(
        "info",
        `Queueing download for ${contentName} ${autoDownloadConfig.downloadDelay && autoDownloadConfig.downloadDelay >= 0
          ? `in ${autoDownloadConfig.downloadDelay}ms`
          : "immediately"
        }`
      );
    }
    setTimeout(() => {
      queuedContentInfo!.dfContent = dfContentInfo;
      this.workQueue.push({
        dfContentInfo,
        mediaInfo,
      });
      serviceLocator.notificationConsumers.forEach((consumer) => consumer.downloadQueued(dfContentInfo!));
    }, delay || 0);

    return queuedContentInfo;
  }

  setupRetry(contentName: string) {
    const downloadConfig = configService.config.downloads;
    const pendingInfo = this.queuedContent.get(contentName);
    if (!pendingInfo) {
      logger.log("error", `Failed to get pending info for ${contentName}, unable to retry`);
      return;
    }
    if (pendingInfo.currentAttempt >= downloadConfig.maxRetries) {
      logger.log("warn", `${contentName} has exceeded max retry attempts of ${downloadConfig.maxRetries}`);
      return;
    }
    const nextAttempt = new Date();
    nextAttempt.setTime(nextAttempt.getTime() + pendingInfo.currentRetryInterval);
    logger.log(
      "info",
      `Failed download for ${contentName} will be removed from pending list to be attempted again in ${pendingInfo.currentRetryInterval}ms ` +
      `(${nextAttempt}). Retry attempt: ${pendingInfo.currentAttempt + 1})`
    );
    setTimeout(() => {
      logger.log("info", `Failed download ${contentName} marked ready for retry`);
      pendingInfo.readyForRetry = true;
      this.getContent(pendingInfo.name);
    }, pendingInfo.currentRetryInterval);
  }

  progressUpdate(dfContent: DfContentInfo, mediaInfo: MediaInfo, progressUpdate: DownloadProgressInfo) {
    serviceLocator.notificationConsumers.forEach((consumer) =>
      consumer.downloadProgressUpdate(dfContent, mediaInfo, progressUpdate)
    );
  }

  async userTierChanged(newTier?: string) {
    const userInfo = this.dfUserManager.currentDfUserInfo;
    if (this.dfUserManager.isUserSignedIn() && userInfo) {
      serviceLocator.notificationConsumers.forEach((consumer) =>
        consumer.userSignedIn(userInfo.username, userInfo.tier)
      );
      const allContentEntries = await this.db.getAllContentEntries();
      const ignoredPaywalledContent = allContentEntries.filter((ignoredContent) => {
        if (ignoredContent.statusInfo.status !== "CONTENT_PAYWALLED") {
          return false;
        }
        return (ignoredContent.statusInfo as DfContentStatusInfoPaywalled).userTierWhenUnavailable !== newTier;
      });
      //TODO: Either find a way to find *which* tier content belongs to or rescan all content to see whether it's still paywalled
      ignoredPaywalledContent.forEach((contentInfo) => {
        contentInfo.statusInfo.status = DfContentStatus.AVAILABLE;
      });
      logger.log("info", `Setting all paywalled content to "Available" (may not be accurate)"`);
      await this.db.addContentInfos(...ignoredPaywalledContent);
      await this.patchMetas();
    } else {
      serviceLocator.notificationConsumers.forEach((consumer) => consumer.userNotSignedIn());
      //TODO: Either find a way to find *which* tier content belongs to or rescan all content to see whether it's still paywalled
      const allContentEntries = await this.db.getAllContentEntries();
      const availableContentEntries = allContentEntries.filter(
        (contentInfo) => contentInfo.statusInfo.status === "AVAILABLE"
      );
      availableContentEntries.forEach((contentInfo) => {
        contentInfo.statusInfo.status = DfContentStatus.CONTENT_PAYWALLED;
        (contentInfo.statusInfo as DfContentStatusInfoPaywalled).userTierWhenUnavailable = "NONE";
      });
      logger.log("info", `Setting all available content to "Paywalled" (may not be accurate)"`);
      await this.db.addContentInfos(...availableContentEntries);
    }
  }

  get currentFetchQueueSize() {
    return dfFetchWorkerQueue.getQueueSize();
  }

  get scanInProgress() {
    return this.metaFetchesInProgress > 0 || this.currentFetchQueueSize > 0;
  }
}
