import Queue from "better-queue";
import { Config, config } from "./config/config.js";
import { downloadMedia, fetchArchivePageContentList, getMediaInfo } from "./df-fetcher.js";
import { DfMetaInjector } from "./df-mpeg-meta.js";
import { DfNotifier } from "./df-notifier.js";
import { DfContent, MediaInfo } from "./df-types.js";
import { DownloadProgressReport } from "./downloader.js";
import { moveFile } from "./utils/file-utils.js";
import { LogLevel } from "./logger.js";
import { DfDownloaderOperationalDb, IgnoredContentReason, PaywalledContentInfo } from "./db/df-operational-db.js";
import { DfUserManager } from "./df-user-manager.js";

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
  private dfMetaInjector: DfMetaInjector;
  private dfUserManager: DfUserManager;
  notifiers: DfNotifier[] = [];
  pendingContent: Map<string, PendingContent> = new Map<string, PendingContent>();

  workQueue: Queue<DfContent, any>;

  constructor(readonly config: Config, readonly db: DfDownloaderOperationalDb) {
    this.logger = config.logger;
    this.dfMetaInjector = new DfMetaInjector(config);
    this.dfUserManager = new DfUserManager(db);
    this.dfUserManager.addUserTierChangeListener((tier) => this.userTierChanged(tier));
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
            const downloadLocation = await downloadMedia(
              dfContent,
              mediaInfo,
              (progressUpdate: DownloadProgressReport) => {
                dfContent.progress = progressUpdate;
                this.progressUpdate(dfContent, mediaInfo, progressUpdate);
              }
            );
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
            await this.db.contentDownloaded(
              dfContent.name,
              mediaInfo.mediaType,
              destination,
              mediaInfo.size,
              new Date().toISOString()
            );
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

  async start(firstRun: boolean) {
    if (config.ignoreOldContentOnFirstRun && firstRun) {
      const contentList = (await fetchArchivePageContentList()).map(({ link }) => sanitizeContentName(link)).reverse();
      await this.db.ignoreContents(contentList);
    }
    this.logger.log(
      LogLevel.INFO,
      `Starting DF content monitor. Checking for new content every ${config.contentCheckInterval}ms`
    );

    const downloadFromFeed = async () => {
      await this.dfUserManager.checkUserInfo();
      const available = await fetchArchivePageContentList();
      const ignored = await this.db.getIgnoredInfos(available.map((item) => sanitizeContentName(item.link)));
      const toDownload = available.filter((item, index) => !ignored[index]);
      for (const content of toDownload) {
        this.notifiers.forEach((notifier) => notifier.newContentDetected(content.title));
        this.getContent(sanitizeContentName(content.link), config.downloadDelay);
      }
    };
    downloadFromFeed();
    setInterval(downloadFromFeed, config.contentCheckInterval);
  }

  async getMediaInfo(contentName: string) {
    return await getMediaInfo(contentName);
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
    const dfContentInfo = await this.getMediaInfo(contentName);
    if (!dfContentInfo) {
      throw new Error("No media info available");
    }
    if (dfContentInfo.dataPaywalled) {
      this.logger.log(
        LogLevel.INFO,
        `Not downloading ${dfContentInfo.name} as data is paywalled; adding to ignore list`
      );
      this.db.ignorePaywalledContent(dfContentInfo.name, this.dfUserManager.getCurrentTier());
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
      this.workQueue.push(dfContentInfo);
      this.notifiers.forEach((notifier) => notifier.downloadQueued(dfContentInfo));
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
    const ignoredContentInfos = await this.db.getAllIgnoredInfos();
    const ignoredPaywalledContent = ignoredContentInfos.filter((ignoredContent) => {
      if (ignoredContent.reason !== IgnoredContentReason.CONTENT_PAYWALLED) {
        return false;
      }
      return (ignoredContent as PaywalledContentInfo).userTierWhenUnavailable !== newTier;
    }) as PaywalledContentInfo[];
    const toRemove = ignoredPaywalledContent.map((info) => info.name);
    this.logger.log(LogLevel.INFO, `Removing paywalled content from ignore list: ${toRemove}`);
    await this.db.removeIgnoredContentInfos(toRemove);
  }
}
