import Queue from "better-queue";
import fs from "node:fs";
import { Config, config } from "./config.js";
import { DigitalFoundryFetcher } from "./df-fetcher.js";
import { DfMetaInjector } from "./df-mpeg-meta.js";
import { DfNotifier } from "./df-notifier.js";
import { DfContent, MediaInfo } from "./df-types.js";
import { download, DownloadProgressReport } from "./downloader.js";
import { moveFile } from "./helper.js";
import { LogLevel } from "./logger.js";

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

export const sanitizeContentName = (contentNameOrUrl: string) => {
  const slashIdx = contentNameOrUrl.lastIndexOf("/");
  if (slashIdx > 0) {
    return contentNameOrUrl.substring(slashIdx + 1);
  }
  return contentNameOrUrl;
};

export class DigitalFoundryContentManager {
  private readonly logger;
  private dfFetcher: DigitalFoundryFetcher;
  private dfMetaInjector: DfMetaInjector;
  ignoreFileLocation: string;
  notifiers: DfNotifier[] = [];
  ignoreSet: Set<string> = new Set<string>();
  pendingContent: Map<string, PendingContent> = new Map<string, PendingContent>();

  workQueue: Queue<DfContent, any>;

  constructor(readonly config: Config) {
    this.logger = config.logger;
    this.dfFetcher = new DigitalFoundryFetcher(config, this);
    this.dfMetaInjector = new DfMetaInjector(config);
    this.ignoreFileLocation = `${config.configDir}/ignorelist.txt`;
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
          try {
            this.notifiers.forEach((notifier) => notifier.downloadStarting(dfContent, mediaInfo));
            const downloadLocation = await this.dfFetcher.downloadMedia(dfContent, mediaInfo);
            if (!downloadLocation) {
              err = `Unable to download ${dfContent.name}`;
              return;
            }
            pendingInfo!.contentStatus = ContentStatus.SETTING_METADATA;

            try {
              await this.dfMetaInjector.setMeta(downloadLocation, dfContent);
              this.logger.log(LogLevel.DEBUG, `Set meta for ${dfContent.name}`);
            } catch (e) {
              this.logger.log(LogLevel.ERROR, `Unable to inject metadata for ${dfContent.name} - continuing anyway`, e);
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
            fs.appendFileSync(this.ignoreFileLocation, `${dfContent.name}`);
            this.ignoreSet.add(dfContent.name);
            pendingInfo!.contentStatus = ContentStatus.DONE;
            this.pendingContent.delete(dfContent.name);
            this.notifiers.forEach((notifier) => notifier.downloadComplete(dfContent, mediaInfo, destination));
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

  async start() {
    if (config.ignoreOldContentOnFirstRun) {
      if (!fs.existsSync(this.ignoreFileLocation)) {
        // TODO: Switch to fetching historical from
        const contentList = (await this.dfFetcher.fetchFeed()).map(({ link }) => sanitizeContentName(link)).sort();
        this.logger.log(
          LogLevel.INFO,
          `First run - IGNORE_OLD_CONTENT set, adding ${contentList.length} videos to ignore list`
        );
        const contentListStr = contentList.join("\n");
        fs.writeFileSync(this.ignoreFileLocation, contentListStr);
      }
    }
    this.logger.log(
      LogLevel.INFO,
      `Starting DF content monitor. Checking for new content every ${config.checkInterval}ms`
    );
    try {
      const ignoreListStr = fs.readFileSync(this.ignoreFileLocation, "utf-8");
      ignoreListStr.split(/\r?\n/).forEach((line) => {
        const toIgnore = line.trim();
        if (toIgnore.length === 0) {
          return;
        }
        this.ignoreSet.add(toIgnore);
      });
    } catch (e) {}

    const downloadFromFeed = async () => {
      const toDownload = (await this.dfFetcher.fetchFeed()).filter(
        (item) => !this.ignoreSet.has(sanitizeContentName(item.link))
      );
      for (const content of toDownload) {
        this.notifiers.forEach((notifier) => notifier.newContentDetected(content.title));
        this.getContent(sanitizeContentName(content.link), config.downloadDelay);
      }
    };
    downloadFromFeed();
    setInterval(downloadFromFeed, config.checkInterval);

    // this.checkForNewMedia();
    // setInterval(() => {
    //   this.checkForNewMedia();
    // }, this.checkInterval);
  }

  async getMediaInfo(contentName: string) {
    return await this.dfFetcher.getMediaInfo(contentName);
  }

  async getContent(contentName: string, delay?: number) {
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
    const dfContentInfo = await this.dfFetcher.getMediaInfo(contentName);
    if (!dfContentInfo) {
      throw new Error("No media info available");
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
      this.workQueue.push(dfContentInfo);
      this.notifiers.forEach((notifier) => notifier.downloadQueued(dfContentInfo));
    }, delay || 0);

    return dfContentInfo;
  }

  //   async checkForNewMedia() {
  //     try {
  //       const contentList = await this.dfFetcher.getContentList();
  //       const now = new Date();
  //       const toDownload = contentList
  //         .filter((contentName) => {
  //           if (this.ignoreSet.has(contentName)) {
  //             return false;
  //           }
  //           const pendingInfo = this.pendingContent.get(contentName);
  //           if (!pendingInfo) {
  //             return true;
  //           }
  //           return pendingInfo.readyForRetry;
  //         })
  //         .map((contentName) => {
  //           return {
  //             contentName,
  //             pendingInfo: this.pendingContent.get(contentName),
  //           };
  //         });
  //       if (toDownload.length === 0) {
  //         this.logger.log(LogLevel.SILLY, "Nothing new to download, returning");
  //         return;
  //       }
  //       this.logger.log(
  //         LogLevel.DEBUG,
  //         "Queueing the following for download:",
  //         toDownload
  //       );
  //       for (const content of toDownload) {
  //         if (content.pendingInfo) {
  //           content.pendingInfo.newAttempt();
  //         } else {
  //           content.pendingInfo = new PendingContent(
  //             content.contentName,
  //             this.failureRetryIntervalBase,
  //             now
  //           );
  //           this.pendingContent.set(content.contentName, content.pendingInfo);
  //         }
  //       }

  //         setTimeout(() => {
  //           this.dfFetcher
  //             .getMediaInfo(content.contentName)
  //             .then((dfContentInfo) => {
  //               this.workQueue.push(dfContentInfo);
  //               this.notifiers.forEach((notifier) =>
  //                 notifier.downloadQueued(dfContentInfo)
  //               );
  //             })
  //             .catch((e) => {
  //               this.setupRetry(content.contentName);
  //             });
  //         }, delay);
  //       }
  //     } catch (e) {
  //       this.logger.log(LogLevel.WARN, `Unable to fetch content`, e);
  //     }
  //   }

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
}
