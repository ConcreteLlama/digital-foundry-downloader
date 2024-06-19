import {
  CURRENT_DATA_VERSION,
  DfContentEntry,
  DfContentEntryUpdate,
  DfContentInfo,
  DfContentInfoUtils,
  DfContentStatus,
  MediaInfo,
  bytesToHumanReadable,
  fileSizeStringToBytes,
  filterContentInfos,
  getMediaTypeIndex,
  logger,
  transformFirstMatchAsync,
} from "df-downloader-common";
import fs from "fs/promises";
import path from "path";
import { configService } from "./config/config.js";
import { DbInitInfo, DfDownloaderOperationalDb, DownloadInfoWithName } from "./db/df-operational-db.js";
import { DfContentInfoReference, forEachArchivePage, getMediaInfo, makeDfContentUrl } from "./df-fetcher.js";
import { DfTaskManager } from "./df-task-manager.js";
import { DfUserManager } from "./df-user-manager.js";
import { serviceLocator } from "./services/service-locator.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { deleteFile, ensureDirectory } from "./utils/file-utils.js";
import { getMostImportantItem } from "./utils/importance-list.js";
import { dfFetchWorkerQueue, fileScannerQueue } from "./utils/queue-utils.js";

export class DigitalFoundryContentManager {
  private dfUserManager: DfUserManager;
  readonly taskManager: DfTaskManager;
  noMediaContentInfos: Map<
    string,
    {
      attempts: number;
      contentRef: DfContentInfoReference;
    }
  > = new Map();
  metaFetchesInProgress: number = 0;

  constructor(readonly db: DfDownloaderOperationalDb) {
    this.dfUserManager = new DfUserManager(db);
    this.dfUserManager.addUserTierChangeListener((tier) => this.userTierChanged(tier));
    this.taskManager = new DfTaskManager();
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
      if (contentEntry.contentInfo.mediaInfo?.length === 0 && this.dfUserManager.getCurrentTier()) {
        logger.log("info", `Content entry ${contentEntry.name} has no media info, adding to no media list`);
        this.noMediaContentInfos.set(contentEntry.name, {
          attempts: 0,
          contentRef: {
            title: contentEntry.contentInfo.title,
            name: contentEntry.name,
            link: makeDfContentUrl(contentEntry.name),
            thumbnail: contentEntry.contentInfo.thumbnailUrl || "",
          },
        });
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
          if (mediaInfo.mediaFilename) {
            const urlFilename = mediaInfo.mediaFilename;
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
        await this.db.addOrUpdateEntries(contentEntry);
      }
    }
    const requiringUpdate = contentEntries
      .filter(
        (contentEntry) =>
          !contentEntry.contentInfo ||
          contentEntry.dataVersion !== CURRENT_DATA_VERSION ||
          requiringMetaRefresh.has(contentEntry.name)
      )
      .sort((a, b) => b.contentInfo?.publishedDate.getTime() - a.contentInfo?.publishedDate.getTime());
    if (requiringUpdate.length === 0) {
      logger.log("info", "No content entries require meta patching");
      return;
    }
    await this.refreshMeta(...requiringUpdate.map((contentEntry) => contentEntry.name));
  }

  async refreshMeta(...contentNames: string[]) {
    const updatedMetas: DfContentEntry[] = [];
    try {
      this.metaFetchesInProgress++;
      while (contentNames.length > 0) {
        const entryBatch = contentNames.splice(0, 10);
        const contentInfoResults = await Promise.allSettled(
          entryBatch.map((contentName) =>
            dfFetchWorkerQueue.addWork(() => {
              logger.log("info", `${contentName} has out of date meta; fetching info and patching`);
              return getMediaInfo(contentName);
            })
          )
        );
        const existingEntries = await this.db.getContentInfoMap(entryBatch);
        const toUpdate: DfContentEntryUpdate[] = [];
        contentInfoResults.forEach((result, idx) => {
          if (result.status === "rejected") {
            logger.log("error", `Failed to fetch meta for ${entryBatch[idx]} ${result.reason}`);
          } else {
            logger.log("info", `Successfully fetched meta for ${result.value.name}`);
            const contentName = entryBatch[idx];
            const contentInfo = result.value;
            const existingContentEntry = existingEntries.get(contentName);
            if (existingContentEntry) {
              existingContentEntry.contentInfo = contentInfo;
              existingContentEntry.dataVersion = CURRENT_DATA_VERSION;
              toUpdate.push(existingContentEntry);
            } else {
              toUpdate.push({
                name: contentName,
                contentInfo,
                statusInfo: contentInfo.dataPaywalled
                  ? { userTierWhenUnavailable: this.dfUserManager.getCurrentTier(), status: DfContentStatus.PAYWALLED }
                  : { status: DfContentStatus.AVAILABLE },
              });
            }
          }
        });
        const updated = await this.db.updateEntries(...toUpdate);
        updatedMetas.push(...updated);
      }
    } finally {
      this.metaFetchesInProgress--;
    }
    return updatedMetas;
  }

  async scanForExistingFiles() {
    const contentManagementConfig = configService.config.contentManagement;
    const contentEntries = await this.db.getAllContentEntries();

    const notDownloaded = contentEntries.filter((contentEntry) => contentEntry.downloads.length === 0);
    logger.log("info", "Scanning for existing files");
    while (notDownloaded.length > 0) {
      const toCheck = notDownloaded.splice(0, 50);
      const toAddDownload: DownloadInfoWithName[] = [];
      await Promise.allSettled(
        toCheck.map(async (contentEntry) => {
          const { contentInfo } = contentEntry;
          const fileMatch = await transformFirstMatchAsync(contentInfo.mediaInfo, async (mediaInfo) => {
            const fileNameWithMediaType = DfContentInfoUtils.makeFileName(contentInfo, mediaInfo, true);
            const fileNameWithoutMediaType = DfContentInfoUtils.makeFileName(contentInfo, mediaInfo, false);
            const filenames: string[] = [fileNameWithMediaType, fileNameWithoutMediaType];
            mediaInfo.mediaFilename && filenames.push(mediaInfo.mediaFilename);
            for (const contentFilename of filenames) {
              const fullFilename = path.join(contentManagementConfig.destinationDir, contentFilename);
              try {
                await fileScannerQueue.addWork(() => fs.access(fullFilename));
                const fileInfo = await fileScannerQueue.addWork(() => fs.stat(fullFilename));
                if (!fileInfo) {
                  continue;
                }
                return {
                  matchingFileName: fullFilename,
                  matchingFileStats: fileInfo,
                  exactMatch: contentFilename === fileNameWithMediaType,
                  mediaInfo,
                };
              } catch (e) {
                // File not found, continue loop
              }
            }
            return false;
          });
          if (fileMatch) {
            const { matchingFileName, matchingFileStats, exactMatch } = fileMatch;
            let bestMatch: MediaInfo;
            if (exactMatch) {
              logger.log("info", `Found exact match for ${contentInfo.name} at ${matchingFileName}`);
              bestMatch = fileMatch.mediaInfo;
            } else {
              logger.log(
                "info",
                `Found inexact match for ${contentInfo.name} at ${matchingFileName}, finding closest match`
              );
              const matchingMediaInfos: [MediaInfo, number][] = contentInfo.mediaInfo.map((mediaInfo) => {
                try {
                  const sizeDifference = Math.abs(
                    fileSizeStringToBytes(mediaInfo.size || "0") - matchingFileStats.size
                  );
                  return [mediaInfo, sizeDifference];
                } catch (e: any) {
                  return [mediaInfo, -1];
                }
              });
              bestMatch = matchingMediaInfos.sort(([, a], [, b]) => a - b)[0][0];
            }
            toAddDownload.push({
              name: contentInfo.name,
              downloadInfo: {
                format: bestMatch.mediaType,
                downloadLocation: matchingFileName,
                size: bytesToHumanReadable(matchingFileStats.size),
                downloadDate: matchingFileStats.birthtime,
              },
            });
          }
        })
      );
      await this.db.addDownloads(toAddDownload);
    }

    logger.log("info", "Finished scanning for existing files");
  }

  async getNewContentList() {
    const toReturn: DfContentInfoReference[] = [];
    await forEachArchivePage(async (contentList) => {
      const existingMeta = await this.db.getContentEntryList(contentList.map((contentRef) => contentRef.name));
      const newContentInfos = contentList.filter(
        (value, idx) => !existingMeta[idx] && !this.taskManager.hasPipelineForContent(value.name)
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
    const noMediaInfoContents = [...this.noMediaContentInfos.values()];
    logger.log(
      "info",
      `Checking for new content${
        noMediaInfoContents.length
          ? ` and media info for the following media with no media infos: ${noMediaInfoContents
              .map((v) => v.contentRef.name)
              .join(", ")}`
          : ""
      }`
    );
    const autoDownloadConfig = configService.config.automaticDownloads;
    const newContentRefs = [...(await this.getNewContentList()), ...noMediaInfoContents.map((v) => v.contentRef)];
    const newContentInfos = await this.getContentInfos(newContentRefs);
    const newNoMediaContentInfoMap = new Map<string, { attempts: number; contentRef: DfContentInfoReference }>();
    newContentInfos.forEach((contentInfo, idx) => {
      if (!contentInfo) {
        return;
      }
      if (!contentInfo.mediaInfo.length && this.dfUserManager.getCurrentTier()) {
        logger.log("info", `No media info found for ${contentInfo.name}, adding to no media list`);
        const attempts = this.noMediaContentInfos.get(contentInfo.name)?.attempts || 0;
        if (attempts >= 60 * 24) {
          logger.log("info", `Removing ${contentInfo.name} from no media list as it has been there for over 24 hours`);
          return;
        }
        newNoMediaContentInfoMap.set(contentInfo.name, {
          attempts: (this.noMediaContentInfos.get(contentInfo.name)?.attempts || 0) + 1,
          contentRef: newContentRefs[idx],
        });
      }
    });
    this.noMediaContentInfos = newNoMediaContentInfoMap;
    if (autoDownloadConfig.enabled) {
      const { include, exclude } = autoDownloadConfig.exclusionFilters?.length
        ? filterContentInfos(autoDownloadConfig.exclusionFilters, newContentInfos, true)
        : { include: newContentInfos, exclude: [] };
      exclude.length &&
        logger.log(
          "info",
          `Ignoring ${exclude.map((contentInfo) => contentInfo.name).join(", ")} due to exclusion filters`
        );
      await this.db.addContents(this.dfUserManager.getCurrentTier() || "NONE", newContentInfos);
      for (const content of include) {
        serviceLocator.notifier.newContentDetected(content.title);
        this.downloadContentIn(content, autoDownloadConfig.downloadDelay);
      }
    } else {
      await this.db.addContents(this.dfUserManager.getCurrentTier() || "NONE", newContentInfos);
    }
  }

  async getUpdateMediaInfo(contentName: string) {
    logger.log("info", `Getting updated media info for ${contentName}`);
    const newContentInfo = await getMediaInfo(contentName);
    if (!newContentInfo) {
      throw new Error(`Failed to get media info for ${contentName}`);
    }
    const updated = await this.db.updateContentInfo(contentName, newContentInfo);
    return updated;
  }

  async downloadContentIn(content: string | DfContentInfo, delay: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (delay) {
        logger.log(
          "info",
          `Queueing download for ${typeof content === "string" ? content : content.name} ${
            delay && delay >= 0 ? `in ${delay}ms` : "immediately"
          }`
        );
      }
      setTimeout(() => {
        this.downloadContent(content)
          .then(() => resolve())
          .catch((err) => reject(err));
      }, delay || 0);
    });
  }

  async downloadContent(
    content: string | DfContentInfo,
    {
      mediaType,
    }: {
      mediaType?: string;
    } = {}
  ) {
    const autoDownloadConfig = configService.config.automaticDownloads;
    let contentName: string, contentInfoArg: DfContentInfo | undefined;
    if (typeof content === "string") {
      contentName = sanitizeContentName(content);
    } else {
      contentName = content.name;
      contentInfoArg = content;
    }
    const updatedContentInfo = await this.getUpdateMediaInfo(contentName).catch((e) => {
      logger.log(
        "error",
        `Failed to get updated media info for ${contentName}${
          contentInfoArg ? " - using existing cached version" : ""
        }: ${e}`
      );
    });
    const dfContentInfo = updatedContentInfo?.contentInfo || contentInfoArg;
    if (!dfContentInfo) {
      throw new Error(`Unable to find content info for ${contentName}`);
    }
    const mediaInfo =
      (mediaType ? dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.mediaType === mediaType) : undefined) ||
      getMostImportantItem(autoDownloadConfig.mediaTypes, dfContentInfo.mediaInfo, (mediaTypeList, mediaInfo) =>
        getMediaTypeIndex(mediaTypeList, mediaInfo.mediaType)
      );
    if (!mediaInfo) {
      throw new Error(`Could not get valid media info for ${dfContentInfo.name}`);
    }
    if (dfContentInfo.dataPaywalled) {
      logger.log("info", `Not downloading ${dfContentInfo.name} as data is paywalled; adding to ignore list`);
      this.db.addContents(this.dfUserManager.getCurrentTier() || "NONE", [dfContentInfo]);
      throw new Error(`Content ${dfContentInfo.name} is paywalled`);
    }

    const pipelineExec = this.taskManager
      .downloadContent(dfContentInfo, mediaInfo)
      .on("completed", (pipelineResult) => {
        if (pipelineResult.status === "success") {
          const finalPipelineResult = pipelineResult.pipelineResult;
          const { size, downloadLocation, mediaInfo, subtitles } = finalPipelineResult;
          this.db.contentDownloaded(dfContentInfo.name, {
            format: mediaInfo.mediaType,
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
      contentName: dfContentInfo.name,
      mediaInfo: mediaInfo,
      pipelineExec,
    };
  }

  async userTierChanged(newTier?: string) {
    const userInfo = this.dfUserManager.currentDfUserInfo;
    if (this.dfUserManager.isUserSignedIn() && userInfo) {
      serviceLocator.notifier.userSignedIn(userInfo.username, userInfo.tier);
      const allContentEntries = await this.db.getAllContentEntries();
      const ignoredPaywalledContent = allContentEntries.filter((ignoredContent) => {
        if (ignoredContent.statusInfo.status !== "PAYWALLED") {
          return false;
        }
        return ignoredContent.statusInfo.userTierWhenUnavailable !== newTier;
      });
      ignoredPaywalledContent.forEach((contentInfo) => {
        contentInfo.statusInfo.status = DfContentStatus.AVAILABLE;
      });
      logger.log("info", `Setting all paywalled content to "Available" (may not be accurate)"`);
      await this.db.addOrUpdateEntries(...ignoredPaywalledContent);
      await this.patchMetas();
    } else {
      serviceLocator.notifier.userNotSignedIn();
      //TODO: Either find a way to find *which* tier content belongs to or rescan all content to see whether it's still paywalled
      const allContentEntries = await this.db.getAllContentEntries();
      const availableContentEntries = allContentEntries.filter(
        (contentInfo) => contentInfo.statusInfo.status === "AVAILABLE"
      );
      availableContentEntries.forEach((contentInfo) => {
        contentInfo.statusInfo.status = DfContentStatus.PAYWALLED;
        contentInfo.statusInfo.userTierWhenUnavailable = "NONE";
      });
      logger.log("info", `Setting all available content to "Paywalled" (may not be accurate)"`);
      await this.db.addOrUpdateEntries(...availableContentEntries);
    }
  }

  async deleteDownload(contentEntry: DfContentEntry, downloadLocation: string) {
    if (!contentEntry.downloads.find((d) => d.downloadLocation === downloadLocation)) {
      throw new Error(`Download not found for content ${contentEntry.name}`);
    }
    const deleted = await deleteFile(downloadLocation);
    if (!deleted) {
      throw new Error(`Failed to delete file ${downloadLocation}`);
    }
    await this.db.removeDownload(contentEntry.name, downloadLocation);
  }

  get currentFetchQueueSize() {
    return dfFetchWorkerQueue.getQueueSize();
  }

  get scanInProgress() {
    return this.metaFetchesInProgress > 0 || this.currentFetchQueueSize > 0;
  }
}
