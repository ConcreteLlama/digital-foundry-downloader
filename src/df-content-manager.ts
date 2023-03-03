import Queue from "better-queue";
import { Stats } from "fs";
import fs from "fs/promises";
import prettyBytes from "pretty-bytes";
import { Config, config } from "./config/config.js";
import { DfDownloaderOperationalDb, makeDownloadedContentInfo } from "./db/df-operational-db.js";
import { DfContentReference, downloadMedia, forEachArchivePage, getMediaInfo } from "./df-fetcher.js";
import { DfMetaInjector } from "./df-mpeg-meta.js";
import { DfNotifier } from "./df-notifier.js";
import { DfContent, DownloadedContentInfo, MediaInfo, PaywalledContentInfo } from "./df-types.js";
import { DfUserManager } from "./df-user-manager.js";
import { DownloadProgressReport, DownloadState } from "./downloader.js";
import { LogLevel } from "./logger.js";
import { SubtitleGenerator } from "./media-utils/subtitles.js";
import { sanitizeContentName } from "./utils/df-utils.js";
import { extractFilenameFromUrl, fileSizeStringToBytes, moveFile } from "./utils/file-utils.js";
import { dfFetchWorkerQueue, fileScannerQueue } from "./utils/queue-utils.js";

export enum ContentStatus {
  QUEUED = "QUEUED",
  PENDING_RETRY = "PENDING_RETRY",
  DOWNLOADING = "DOWNLOADING",
  MOVING = "MOVING",
  SETTING_METADATA = "SETTING_METADATA",
  DONE = "DONE",
}

export class PendingContent {
  currentAttempt: number = 0;
  readyForRetry: boolean = false;
  contentStatus: ContentStatus = ContentStatus.QUEUED;
  dfContent?: DfContent;
  constructor(
    public readonly name: string,
    public currentRetryInterval: number,
    public readonly originalDetectionTime: Date
  ) {}

  newAttempt() {
    this.readyForRetry = false;
    this.currentAttempt++;
    this.currentRetryInterval *= 2;
  }
}

export class DigitalFoundryContentManager {
  private readonly logger;
  private dfMetaInjector: DfMetaInjector;
  private dfUserManager: DfUserManager;
  notifiers: DfNotifier[] = [];
  subtitleGenerator?: SubtitleGenerator;
  pendingContent: Map<string, PendingContent> = new Map<string, PendingContent>();

  workQueue: Queue<DfContent, any>;

  constructor(readonly config: Config, readonly db: DfDownloaderOperationalDb) {
    this.logger = config.logger;
    this.dfMetaInjector = new DfMetaInjector(config);
    this.dfUserManager = new DfUserManager(db);
    this.dfUserManager.addUserTierChangeListener((tier) => this.userTierChanged(tier));
    if (process.env.DEEPGRAM_API_KEY) {
      this.subtitleGenerator = new SubtitleGenerator(process.env.DEEPGRAM_API_KEY);
    }
    this.workQueue = new Queue<DfContent, any>(
      async (dfContent: DfContent, cb) => {
        const pendingInfo = this.pendingContent.get(dfContent.name);
        pendingInfo!.contentStatus = ContentStatus.DOWNLOADING;
        let err: any;
        try {
          this.logger.log(LogLevel.DEBUG, `Fetching ${JSON.stringify(dfContent)}`);
          const mediaInfo = config.mediaTypeScoreMap.getTopScoredItem(
            dfContent.mediaInfo,
            (mediaInfo) => mediaInfo.mediaType
          );
          if (!mediaInfo) {
            err = `Could not get valid media info for ${dfContent.name}`;
            return;
          }
          this.logger.log(LogLevel.DEBUG, "Fetching", mediaInfo, "from list", dfContent.mediaInfo);
          this.logger.log(LogLevel.INFO, `Fetching ${dfContent.name} with media type ${mediaInfo.mediaType}`);
          let currentProgress: DownloadProgressReport;
          try {
            this.notifiers.forEach((notifier) => notifier.downloadStarting(dfContent, mediaInfo));
            const downloadResult = await downloadMedia(
              dfContent,
              mediaInfo,
              (progressUpdate: DownloadProgressReport) => {
                progressUpdate && (currentProgress = progressUpdate);
                this.progressUpdate(dfContent, mediaInfo, progressUpdate);
              }
            );
            if (!downloadResult) {
              err = `Unable to download ${dfContent.name}`;
              return;
            }
            if (downloadResult.status === DownloadState.STOPPED) {
              this.logger.log(LogLevel.INFO, `Download for ${dfContent.name} was manually stopped`);
              return;
            }
            if (downloadResult.status === DownloadState.FAILED) {
              err = downloadResult.error;
              return;
            }
            pendingInfo!.contentStatus = ContentStatus.SETTING_METADATA;
            const downloadLocation = downloadResult.destination;
            try {
              await this.dfMetaInjector.setMeta(downloadLocation, dfContent);
              this.logger.log(LogLevel.DEBUG, `Set meta for ${dfContent.name}`);
            } catch (e) {
              this.logger.log(LogLevel.ERROR, `Unable to inject metadata for ${dfContent.name} - continuing anyway`, e);
            }
            if (this.subtitleGenerator) {
              try {
                const subInfo = await this.subtitleGenerator.getSubs(downloadLocation, "eng");
                await this.dfMetaInjector.injectSubs(downloadLocation, subInfo);
              } catch (e) {
                this.logger.log(LogLevel.ERROR, `Unable to get subs for ${dfContent.name} - continuing anyway`, e);
              }
            }

            const filename = dfContent.makeFileName(mediaInfo);
            const destination = `${config.destinationDir}/${filename}`;

            if (downloadLocation !== destination) {
              this.logger.log(
                LogLevel.DEBUG,
                `Destination dir and download dir are not the same, moving ${downloadLocation} to ${destination}`
              );
              pendingInfo!.contentStatus = ContentStatus.MOVING;

              await moveFile(downloadLocation, destination, {
                clobber: true,
              }).catch((e) => this.logger.log(LogLevel.DEBUG, e));
              this.logger.log(LogLevel.DEBUG, `File moved from ${downloadLocation} to ${destination}`);
            }
            await this.dfMetaInjector.setDate(destination, dfContent.publishedDate);
            await this.db.contentDownloaded(dfContent, mediaInfo.mediaType, destination, mediaInfo.size, new Date());
            pendingInfo!.contentStatus = ContentStatus.DONE;
            this.pendingContent.delete(dfContent.name);

            this.notifiers.forEach((notifier) =>
              notifier.downloadComplete(dfContent, mediaInfo, destination, currentProgress)
            );
          } catch (e) {
            err = e;
          }
        } catch (e) {
          err = e;
        } finally {
          if (err) {
            pendingInfo!.contentStatus = ContentStatus.PENDING_RETRY;
            this.logger.log(LogLevel.WARN, `Unable to fetch ${dfContent.name}`);
            this.logger.log(LogLevel.WARN, err);
            this.notifiers.forEach((notifier) => notifier.downloadFailed(dfContent, err));
            this.setupRetry(dfContent.name);
          }
          cb();
        }
      },
      {
        concurrent: config.maxSimultaneousDownloads,
        priority: (dfContent: DfContent, cb) => {
          return cb(null, dfContent.publishedDate.getTime());
        },
      }
    );
  }

  async start(firstRun: boolean) {
    await this.dfUserManager.start();
    if (firstRun) {
      await this.scanWholeArchive();
    } else {
      const newContentList = await this.getNewContentList();
      // Skip new content list when scanning whole archive so we don't ignore it.
      await this.scanWholeArchive(...newContentList.map((contentRef) => contentRef.name));
      await this.patchMetas();
    }
    if (config.scanForExistingFiles) {
      await this.scanForExistingFiles();
    }
    this.logger.log(
      LogLevel.INFO,
      `Starting DF content monitor. Checking for new content every ${config.contentCheckInterval}ms`
    );

    const downloadNewContent = async () => {
      await this.dfUserManager.checkUserInfo();
      await this.downloadNewContents();
    };
    downloadNewContent();
    setInterval(downloadNewContent, config.contentCheckInterval);
  }

  async scanWholeArchive(...ignoreList: string[]) {
    this.logger.log(LogLevel.INFO, `Scanning whole archive`);
    await forEachArchivePage(
      async (contentList) => {
        //We may not have finished completing our first run last time so we should filter the content list
        ignoreList && (contentList = contentList.filter((contentRef) => !ignoreList.includes(contentRef.name)));
        const existingContentInfos = await this.db.getContentInfoMap(
          contentList.map((contentInfo) => contentInfo.name)
        );
        contentList = contentList.filter((content) => {
          const existing = existingContentInfos.get(content.name);
          return !(existing && existing.meta);
        });
        const contentMetas = await Promise.all(
          contentList.map((contentRef) =>
            dfFetchWorkerQueue.addWork(() => {
              this.logger.log(
                LogLevel.INFO,
                `Fetching meta for ${JSON.stringify(contentRef.title)} then adding to ignore list`
              );
              return getMediaInfo(sanitizeContentName(contentRef.link));
            })
          )
        );
        if (contentMetas.length > 0) {
          await this.db.addContents(this.dfUserManager.getCurrentTier(), contentMetas);
        }
        return true;
      },
      1,
      config.maxArchiveDepth
    );
    await this.db.setFirstRunComplete();
  }

  async patchMetas() {
    const contentInfos = await this.db.getAllContentInfos();
    for (const contentInfo of contentInfos) {
      if (!contentInfo.meta) {
        continue;
      }
      let updatesMade = false;
      contentInfo.meta.mediaInfo = contentInfo.meta.mediaInfo.filter((mediaInfo) => {
        try {
          fileSizeStringToBytes(mediaInfo.size || "None");
        } catch (e) {
          this.logger.log(
            LogLevel.INFO,
            `Media info for https://www.digitalfoundry.net/${contentInfo.name} contains invalid entry with unparseable size field, setting to 0`
          );
          mediaInfo.size = "0";
          updatesMade = true;
        }
        const urlFilename = extractFilenameFromUrl(mediaInfo.url);
        if (!urlFilename || urlFilename.trim().length === 0) {
          this.logger.log(
            LogLevel.INFO,
            `Media info for https://www.digitalfoundry.net/${contentInfo.name} contains invalid entry with URL that doesn't contain a file path, removing`
          );
          updatesMade = true;
          return false;
        }
        return true;
      });
      if (updatesMade) {
        await this.db.addContentInfos(contentInfo);
      }
    }
    const missingMetas = contentInfos.filter((contentInfo) => !contentInfo.meta);
    while (missingMetas.length > 0) {
      const metaBatch = missingMetas.splice(0, 10);
      const contentMetas = await Promise.all(
        metaBatch.map((contentInfo) =>
          dfFetchWorkerQueue.addWork(() => {
            this.logger.log(LogLevel.INFO, `${contentInfo.name} is missing meta, fetching info and patching`);
            return getMediaInfo(contentInfo.name);
          })
        )
      );
      metaBatch.forEach((contentInfo, idx) => {
        contentInfo.meta = contentMetas[idx];
      });
      await this.db.addContentInfos(...metaBatch);
    }
  }

  async scanForExistingFiles() {
    const contentInfos = await this.db.getAllContentInfos();

    const notDownloaded = contentInfos.filter((contentInfo) => contentInfo.status !== "DOWNLOADED");
    this.logger.log(LogLevel.INFO, "Scanning for existing files");
    while (notDownloaded.length > 0) {
      const toCheck = notDownloaded.splice(0, 50);
      let toUpdate: DownloadedContentInfo[] = [];
      await Promise.all(
        toCheck.map(async (contentInfo) => {
          let matchingFileStats: Stats | undefined = undefined;
          let matchingFileName: string | undefined = undefined;
          const matchingMediaInfos: [MediaInfo, number][] = [];
          for (const mediaInfo of contentInfo.meta.mediaInfo) {
            const dfDownloaderFilename = contentInfo.meta.makeFileName(mediaInfo);
            const urlFileName = extractFilenameFromUrl(mediaInfo.url);
            const filenames = [
              `${config.destinationDir}/${dfDownloaderFilename}`,
              `${config.destinationDir}/${urlFileName}`,
            ];
            let matchFound = false;
            for (const filename of filenames) {
              if (filename !== matchingFileName) {
                try {
                  await fileScannerQueue.addWork(() => fs.access(filename));
                  const fileInfo = await fileScannerQueue.addWork(() => fs.stat(filename));
                  if (!fileInfo) {
                    continue;
                  }
                  matchingFileName = filename;
                  matchingFileStats = fileInfo;
                  matchFound = true;
                  break;
                } catch (e) {
                  // File not found, continue loop
                }
              }
            }
            if (matchFound) {
              try {
                const sizeDifference = Math.abs(fileSizeStringToBytes(mediaInfo.size || "0") - matchingFileStats!.size);
                matchingMediaInfos.push([mediaInfo, sizeDifference]);
              } catch (e: any) {
                this.logger.log(LogLevel.WARN, `Error with content ${contentInfo.name}`, e.message ? e.message : e);
              }
            }
          }
          if (matchingMediaInfos.length === 0 || !matchingFileName || !matchingFileStats) {
            return;
          }
          const bestMatch = matchingMediaInfos.sort(([, a], [, b]) => a - b)[0][0];
          this.logger.log(LogLevel.INFO, `Found existing file ${matchingFileName} for ${contentInfo.name}`);
          toUpdate.push(
            makeDownloadedContentInfo(
              contentInfo.meta,
              bestMatch.mediaType,
              matchingFileName,
              prettyBytes(matchingFileStats.size),
              matchingFileStats.birthtime
            )
          );
        })
      );
      await this.db.addContentInfos(...toUpdate);
    }

    this.logger.log(LogLevel.INFO, "Finished scanning for existing files");
  }

  async getNewContentList() {
    const toReturn: DfContentReference[] = [];
    await forEachArchivePage(async (contentList) => {
      const existingMeta = await this.db.getContentInfoList(contentList.map((contentRef) => contentRef.name));
      const newContentInfos = contentList.filter(
        (value, idx) => !existingMeta[idx] && !this.pendingContent.has(value.name)
      );
      if (newContentInfos.length === 0) {
        return false;
      }
      toReturn.push(...newContentInfos);
      return newContentInfos.length === contentList.length;
    });
    return toReturn;
  }

  async getContentInfos(dfContentReferences: DfContentReference[]) {
    return await Promise.all(
      dfContentReferences.map((contentInfo) =>
        dfFetchWorkerQueue.addWork(() => {
          return getMediaInfo(contentInfo.name);
        })
      )
    );
  }

  async downloadNewContents() {
    const newContentRefs = await this.getNewContentList();
    const newContentInfos = await this.getContentInfos(newContentRefs);
    for (const content of newContentInfos) {
      this.notifiers.forEach((notifier) => notifier.newContentDetected(content.title));
      this.getContent(content, config.downloadDelay);
    }
  }

  async getMediaInfo(contentName: string) {
    return await getMediaInfo(contentName);
  }

  async getContent(content: string | DfContent, delay?: number) {
    let contentName: string, dfContentInfo: DfContent | undefined;
    if (typeof content === "string") {
      contentName = sanitizeContentName(content);
    } else {
      contentName = content.name;
      dfContentInfo = content;
    }
    let pendingInfo = this.pendingContent.get(contentName);
    if (pendingInfo) {
      if (!pendingInfo.readyForRetry) {
        throw new Error(`Already downloading ${pendingInfo}`);
      }
      pendingInfo.newAttempt();
    } else {
      pendingInfo = new PendingContent(contentName, config.failureRetryIntervalBase, new Date());
      this.pendingContent.set(contentName, pendingInfo);
    }
    if (!dfContentInfo) {
      dfContentInfo = await this.getMediaInfo(contentName);
      if (!dfContentInfo) {
        throw new Error("No media info available");
      }
    }
    if (dfContentInfo.dataPaywalled) {
      this.logger.log(
        LogLevel.INFO,
        `Not downloading ${dfContentInfo.name} as data is paywalled; adding to ignore list`
      );
      this.db.addPaywalledContent(this.dfUserManager.getCurrentTier(), dfContentInfo);
      return;
    }
    if (delay) {
      this.logger.log(
        LogLevel.INFO,
        `Queueing download for ${contentName} ${
          config.downloadDelay && config.downloadDelay >= 0 ? `in ${config.downloadDelay}ms` : "immediately"
        }`
      );
    }
    setTimeout(() => {
      pendingInfo!.dfContent = dfContentInfo;
      this.workQueue.push(dfContentInfo!);
      this.notifiers.forEach((notifier) => notifier.downloadQueued(dfContentInfo!));
    }, delay || 0);

    return dfContentInfo;
  }

  setupRetry(contentName: string) {
    const pendingInfo = this.pendingContent.get(contentName);
    if (!pendingInfo) {
      this.logger.log(LogLevel.ERROR, `Failed to get pending info for ${contentName}, unable to retry`);
      return;
    }
    if (pendingInfo.currentAttempt >= config.maxRetries) {
      this.logger.log(LogLevel.WARN, `${contentName} has exceeded max retry attempts of ${config.maxRetries}`);
      return;
    }
    const nextAttempt = new Date();
    nextAttempt.setTime(nextAttempt.getTime() + pendingInfo.currentRetryInterval);
    this.logger.log(
      LogLevel.INFO,
      `Failed download for ${contentName} will be removed from pending list to be attempted again in ${pendingInfo.currentRetryInterval}ms ` +
        `(${nextAttempt}). Retry attempt: ${pendingInfo.currentAttempt + 1})`
    );
    setTimeout(() => {
      this.logger.log(LogLevel.INFO, `Failed download ${contentName} marked ready for retry`);
      pendingInfo.readyForRetry = true;
      this.getContent(pendingInfo.name);
    }, pendingInfo.currentRetryInterval);
  }

  addNotifier(dfNotifier: DfNotifier) {
    this.notifiers.push(dfNotifier);
  }

  progressUpdate(dfContent: DfContent, mediaInfo: MediaInfo, progressUpdate: DownloadProgressReport) {
    this.notifiers.forEach((notifier) => notifier.downloadProgressUpdate(dfContent, mediaInfo, progressUpdate));
  }

  async userTierChanged(newTier: string) {
    const userInfo = this.dfUserManager.currentUserInfo;
    if (this.dfUserManager.isUserSignedIn() && userInfo) {
      this.notifiers.forEach((notifier) => notifier.userSignedIn(userInfo.username, userInfo.tier));
    } else {
      this.notifiers.forEach((notifier) => notifier.userNotSignedIn());
    }
    const ignoredContentInfos = await this.db.getAllContentInfos();
    const ignoredPaywalledContent = ignoredContentInfos.filter((ignoredContent) => {
      if (ignoredContent.status !== "CONTENT_PAYWALLED") {
        return false;
      }
      return (ignoredContent as PaywalledContentInfo).userTierWhenUnavailable !== newTier;
    }) as PaywalledContentInfo[];
    const toRemove = ignoredPaywalledContent.map((info) => info.name);
    this.logger.log(LogLevel.INFO, `Removing paywalled content from ignore list: ${toRemove}`);
    await this.db.removeContentInfos(toRemove);
  }
}
