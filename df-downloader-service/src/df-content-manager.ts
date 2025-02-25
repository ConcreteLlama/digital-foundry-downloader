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
  filterEmpty
} from "df-downloader-common";
import { configService } from "./config/config.js";
import { ContentInfoWithAvailability, DfDownloaderOperationalDb, DownloadInfoWithName } from "./db/df-operational-db.js";
import { DfContentInfoReference, forEachArchivePage, fetchContentInfo, makeDfContentUrl } from "./df-fetcher.js";
import { DfTaskManager } from "./df-task-manager.js";
import { DfUserManager } from "./df-user-manager.js";
import { serviceLocator } from "./services/service-locator.js";
import { findExistingContent } from "./utils/content-finder.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { deleteFile, ensureDirectory, fileExists, pathIsEqual } from "./utils/file-utils.js";
import { getMostImportantItem } from "./utils/importance-list.js";
import { dfFetchWorkerQueue } from "./utils/queue-utils.js";
import { getFileMoveList } from "./utils/template-utils.js";

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

  async start() {
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
      await this.scanWholeArchive(...newContentList.map((contentRef) => contentRef.name));
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

  async scanWholeArchive(...ignoreList: string[]) {
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    try {
      this.metaFetchesInProgress++;
      const contentDetectionConfig = configService.config.contentDetection;
      logger.log("info", `Scanning whole archive from page 1 to ${contentDetectionConfig.maxArchivePage}`);
      await forEachArchivePage(
        async (contentList) => {
          //We may not have finished completing our first run last time so we should filter the content list
          ignoreList && (contentList = contentList.filter((contentRef) => !ignoreList.includes(contentRef.name)));
          const existingContentInfos = await this.db.getContentEntryMap(
            contentList.map((contentInfo) => contentInfo.name)
          );
          contentList = contentList.filter((content) => {
            const existing = existingContentInfos.get(content.name);
            return !(existing && existing.contentInfo);
          });
          const contentMetas: ContentInfoWithAvailability[] = await Promise.all(
            contentList.map(async(contentRef) =>
              dfFetchWorkerQueue.addWork(() => {
                logger.log("info", `Fetching meta for ${JSON.stringify(contentRef.title)} then adding to ignore list`);
                return fetchContentInfo(sanitizeContentName(contentRef.link));
              })
            )
          );
          if (contentMetas.length > 0) {
            await this.db.setContentInfosWithAvailability(contentMetas, userTier);
          }
          return true;
        },
        1,
        contentDetectionConfig.maxArchivePage
      );
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
          } else if (contentEntry.statusInfo.availability === DfContentAvailability.UNKNOWN) {
            requiringMetaRefresh.add(contentEntry.name);
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
          contentEntry.contentInfo.dataVersion !== CURRENT_DATA_VERSION ||
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
    const refreshedMetaKeys = new Set<string>();
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    try {
      this.metaFetchesInProgress++;
      while (contentNames.length > 0) {
        const entryBatch = contentNames.splice(0, 10);
        const contentInfoResults = await Promise.allSettled(
          entryBatch.map((contentName) =>
            dfFetchWorkerQueue.addWork(() => {
              logger.log("info", `${contentName} has out of date meta; fetching info and patching`);
              return fetchContentInfo(contentName);
            })
          )
        );
        const toUpdate: ContentInfoWithAvailability[] = [];
        contentInfoResults.forEach((result, idx) => {
          if (result.status === "rejected") {
            logger.log("error", `Failed to fetch meta for ${entryBatch[idx]} ${result.reason}`);
          } else {
            logger.log("info", `Successfully fetched meta for ${result.value.contentInfo.name}`);
            const { contentInfo, availability} = result.value;
            toUpdate.push({
              contentInfo,
              availability,
            });
          }
        });
        await this.db.setContentInfosWithAvailability(toUpdate, userTier);
      }
    } finally {
      this.metaFetchesInProgress--;
    }
    return filterEmpty(await this.db.getContentEntryList([...refreshedMetaKeys]));
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
        logger.log("debug", `Download for ${closestMatch.contentEntry.name} already exists (${filePathInfo.fullPath}), skipping`);
        continue;
      }
      if (closestMatch.percentageDiff > 10) {
        logger.log(
          "info",
          `Closest match for ${closestMatch.contentEntry.name} is ${closestMatch.mediaInfo.format} but size differs by ${closestMatch.percentageDiff.toFixed(2)}% - skipping`
        );
        continue;
      }
      const { contentEntry, mediaInfo } = closestMatch;
      const { contentInfo } = contentEntry;
      logger.log(
        "info",
        `Adding download for ${contentEntry.name} (${contentInfo.title}) with media format ${mediaInfo.format}`
      );
      toAddDownload.push({
        name: contentInfo.name,
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
          return fetchContentInfo(contentInfo.name);
        })
      )
    );
  }

  async checkForNewContents() {
    const noMediaInfoContents = [...this.noMediaContentInfos.values()];
    logger.log(
      "info",
      `Checking for new content${noMediaInfoContents.length
        ? ` and media info for the following media with no media infos: ${noMediaInfoContents
          .map((v) => v.contentRef.name)
          .join(", ")}`
        : ""
      }`
    );
    const autoDownloadConfig = configService.config.automaticDownloads;
    const userTier = this.dfUserManager.getCurrentTier() || "NONE";
    const newContentRefs = [...(await this.getNewContentList()), ...noMediaInfoContents.map((v) => v.contentRef)];
    const newContentFetchResults = (await this.getContentInfos(newContentRefs));
    const newNoMediaContentInfoMap = new Map<string, { attempts: number; contentRef: DfContentInfoReference }>();
    newContentFetchResults.forEach(({contentInfo}, idx) => {
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
      const contentInfos = newContentFetchResults.map((result) => result.contentInfo);
      const { include, exclude } = autoDownloadConfig.exclusionFilters?.length
        ? filterContentInfos(autoDownloadConfig.exclusionFilters, contentInfos, true)
        : { include: contentInfos, exclude: [] };
      exclude.length &&
        logger.log(
          "info",
          `Ignoring ${exclude.map((contentInfo) => contentInfo.name).join(", ")} due to exclusion filters`
        );
      await this.db.setContentInfosWithAvailability(newContentFetchResults, userTier);
      for (const content of include) {
        serviceLocator.notifier.newContentDetected(content.title);
        this.downloadContentIn(content, autoDownloadConfig.downloadDelay, {
          skipIfDownloadingOrDownloaded: true,
        });
      }
    } else {
      await this.db.setContentInfosWithAvailability(newContentFetchResults, userTier);
    }
  }

  async getUpdateMediaInfo(contentName: string) {
    logger.log("info", `Getting updated media info for ${contentName}`);
    const fetchResult = await fetchContentInfo(contentName);
    if (!fetchResult) {
      throw new Error(`Failed to get media info for ${contentName}`);
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
    const contentName = typeof content === "string" ? content : content.name;
    return new Promise<void>((resolve, reject) => {
      if (delay) {
        logger.log(
          "info",
          `Queueing download for ${contentName} ${delay && delay >= 0 ? `in ${delay}ms` : "immediately"}`
        );
      }
      setTimeout(async () => {
        if (skipIfDownloadingOrDownloaded) {
          if (this.taskManager.hasPipelineForContent(contentName)) {
            logger.log("info", `Skipping download for ${contentName} as it is already downloading or downloaded`);
            return resolve();
          }
          const contentEntry = await this.db.getContentEntry(contentName).catch((e) => {
            logger.log(
              "error",
              `Failed to get content entry for ${contentName} when checking if already downloaded: ${e}`
            );
            return undefined;
          });
          if (contentEntry && DfContentEntryUtils.hasDownload(contentEntry)) {
            logger.log("info", `Skipping download for ${contentName} as it is already downloaded`);
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
    const autoDownloadConfig = configService.config.automaticDownloads;
    let contentName: string, contentInfoArg: DfContentInfo | undefined;
    if (typeof content === "string") {
      contentName = sanitizeContentName(content);
    } else {
      contentName = content.name;
      contentInfoArg = content;
    }
    const updateResult = await this.getUpdateMediaInfo(contentName).catch((e) => {
      logger.log(
        "error",
        `Failed to get updated media info for ${contentName}${contentInfoArg ? " - using existing cached version" : ""
        }: ${e}`
      );
      return null;
    });
    const dfContentInfo = updateResult?.contentInfo || contentInfoArg;
    if (!dfContentInfo) {
      throw new Error(`Unable to find content info for ${contentName}`);
    }
    const mediaInfo =
      (mediaFormat ? dfContentInfo.mediaInfo.find((mediaInfo) => mediaInfo.format === mediaFormat) : undefined) ||
      getMostImportantItem(autoDownloadConfig.mediaTypes, dfContentInfo.mediaInfo, (mediaTypeList, mediaInfo) =>
        getMediaFormatIndex(mediaTypeList, mediaInfo.format)
      );
    if (!mediaInfo) {
      throw new Error(`Could not get valid media info for ${dfContentInfo.name}`);
    }
    if (updateResult?.availability === DfContentAvailability.PAYWALLED) {
      logger.log("info", `Not downloading ${dfContentInfo.name} as data is paywalled; adding to ignore list`);
      throw new Error(`Content ${dfContentInfo.name} is paywalled`);
    }

    const pipelineExec = this.taskManager
      .downloadContent(dfContentInfo, mediaInfo)
      .on("completed", (pipelineResult) => {
        if (pipelineResult.status === "success") {
          const finalPipelineResult = pipelineResult.pipelineResult;
          const { size, downloadLocation, mediaInfo, subtitles } = finalPipelineResult;
          this.db.contentDownloaded(dfContentInfo.name, {
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
      contentName: dfContentInfo.name,
      mediaInfo: mediaInfo,
      pipelineExec,
    };
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
    await this.refreshMeta(...toRefresh);
  }

  async deleteDownload(contentEntry: DfContentEntry, downloadLocation: string) {
    if (!contentEntry.downloads.find((d) => pathIsEqual(d.downloadLocation, downloadLocation))) {
      throw new Error(`Download not found for content ${contentEntry.name}`);
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
        `Download ${downloadLocation} for ${contentEntry.name} does not exist, removing from database`
      );
    }
    await this.db.removeDownload(contentEntry.name, downloadLocation);
  }

  get currentFetchQueueSize() {
    return dfFetchWorkerQueue.getQueueSize();
  }

  get scanInProgress() {
    return this.metaFetchesInProgress > 0 || this.currentFetchQueueSize > 0;
  }

  async getFileMoveList(template: string) {
    const allContentEntries = await this.db.getAllContentEntries();
    return getFileMoveList(allContentEntries, template);
  }
            
}
