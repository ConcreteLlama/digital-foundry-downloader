import got from "got";
import { Config } from "./config.js";
import { DfContent, MediaInfo } from "./df-types.js";
import { DownloadProgressReport, downloadProgressToString } from "./downloader.js";
import { Logger, LogLevel } from "./logger.js";

export enum DfNotificationType {
  DOWNLOAD_COMPLETE,
  DOWNLOAD_FAILED,
  DOWNLOAD_STARTING,
  NEW_CONTENT_DETECTED,
  DOWNLOAD_QUEUED,
}

export const AllNotifications: DfNotificationType[] = [
  DfNotificationType.DOWNLOAD_COMPLETE,
  DfNotificationType.DOWNLOAD_FAILED,
  DfNotificationType.DOWNLOAD_STARTING,
  DfNotificationType.NEW_CONTENT_DETECTED,
  DfNotificationType.DOWNLOAD_QUEUED,
];

export abstract class DfNotifier {
  subscribedNotifications: Set<DfNotificationType>;
  constructor(...subscribedNotifications: DfNotificationType[]) {
    this.subscribedNotifications = new Set<DfNotificationType>(subscribedNotifications);
  }

  downloadComplete(...args: [dfContent: DfContent, mediaInfo: MediaInfo, fileLocation: string]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_COMPLETE)) {
      this.notifyDownloadComplete(...args);
    }
    this.downloadEnded(args[0].name);
  }
  downloadFailed(...args: [dfContent: DfContent, err: any]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_FAILED)) {
      this.notifyDownloadFailed(...args);
    }
    this.downloadEnded(args[0].name);
  }
  downloadStarting(...args: [dfContent: DfContent, mediaInfo: MediaInfo]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_STARTING)) {
      this.notifyDownloadStarting(...args);
    }
  }
  newContentDetected(...args: [contentName: string]): void {
    if (this.subscribedNotifications.has(DfNotificationType.NEW_CONTENT_DETECTED)) {
      this.notifyNewContentDetected(...args);
    }
  }
  downloadQueued(...args: [dfContent: DfContent]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_QUEUED)) {
      this.notifyDownloadQueued(...args);
    }
  }
  abstract downloadProgressUpdate(
    dfContent: DfContent,
    mediaInfo: MediaInfo,
    progressUpdate: DownloadProgressReport
  ): void;
  abstract notifyDownloadComplete(dfContent: DfContent, mediaInfo: MediaInfo, fileLocation: string): void;
  abstract notifyDownloadFailed(dfContent: DfContent, err: any): void;
  abstract notifyDownloadStarting(dfContent: DfContent, mediaInfo: MediaInfo): void;
  abstract notifyNewContentDetected(contentName: string): void;
  abstract notifyDownloadQueued(dfContent: DfContent): void;
  abstract downloadEnded(dfContentName: string): void;

  toSummary(dfContent: DfContent, mediaInfo: MediaInfo) {
    return `Title:       ${dfContent.title}
Published:   ${dfContent.publishedDate}
Media type:  ${mediaInfo.mediaType}
Size:        ${mediaInfo.size}
Description: ${dfContent.description}`;
  }
}

export class LoggerDfNotifier extends DfNotifier {
  private readonly logger: Logger;
  constructor(private config: Config, private logLevel: LogLevel, ...subscribedNotifications: DfNotificationType[]) {
    super(...subscribedNotifications);
    this.logger = config.logger;
  }

  notifyDownloadComplete(dfContent: DfContent, mediaInfo: MediaInfo, fileLocation: string): void {
    this.logger.log(
      this.logLevel,
      `Download success ${dfContent.name}, downloaded to ${fileLocation}:\n\n${this.toSummary(dfContent, mediaInfo)}`
    );
  }
  notifyDownloadFailed(dfContent: DfContent, err: any): void {
    this.logger.log(this.logLevel, `Download failed for ${dfContent.name}`, err);
  }
  notifyDownloadStarting(dfContent: DfContent, mediaInfo: MediaInfo): void {
    this.logger.log(this.logLevel, `Download started for:\n\n${this.toSummary(dfContent, mediaInfo)}`);
  }
  notifyNewContentDetected(contentName: string): void {
    this.logger.log(this.logLevel, `New content detected: ${contentName}`);
  }
  notifyDownloadQueued(dfContent: DfContent): void {
    this.logger.log(this.logLevel, `Download queued for ${dfContent.name}}`);
  }
  downloadProgressUpdate(dfContent: DfContent, mediaInfo: MediaInfo, progressUpdate: DownloadProgressReport): void {
    this.logger.log(this.logLevel, `Download ${dfContent.name}} progress: ${downloadProgressToString(progressUpdate)}`);
  }
  downloadEnded(dfContentName: string): void {}
}

export class PushBulletNotifier extends DfNotifier {
  contentMap: Map<string, string> = new Map<string, string>();

  constructor(private apiKey: string, ...subscribedNotifications: DfNotificationType[]) {
    super(...subscribedNotifications);
  }

  sendPush(dfContentName: string, title: string, body: string, addToMap: boolean = true) {
    got
      .post("https://api.pushbullet.com/v2/pushes", {
        headers: {
          "Access-Token": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          type: "note",
        }),
      })
      .catch((e) => {
        console.log(e);
      })
      .then((response) => {
        if (addToMap) {
          if (
            response &&
            response.body &&
            response.headers["content-type"] &&
            response.headers["content-type"].toLowerCase().includes("application/json")
          ) {
            const obj = JSON.parse(response.body);
            if (obj.iden) {
              this.contentMap.set(dfContentName, obj.iden);
            }
          }
        }
      });
  }

  notifyDownloadComplete(dfContent: DfContent, mediaInfo: MediaInfo, fileLocation: string): void {
    this.sendPush(
      dfContent.name,
      `DF Downloaded: ${dfContent.title}`,
      `${dfContent.name}, downloaded to ${fileLocation}:\n\n${this.toSummary(dfContent, mediaInfo)}`,
      false
    );
    this.contentMap.delete(dfContent.name);
  }
  notifyDownloadFailed(dfContent: DfContent, err: any): void {
    this.sendPush(
      dfContent.name,
      `DF Download failed: ${dfContent.title}`,
      `Download failed for ${dfContent.name}`,
      false
    );
    this.contentMap.delete(dfContent.name);
  }
  notifyDownloadStarting(dfContent: DfContent, mediaInfo: MediaInfo): void {
    this.sendPush(
      dfContent.name,
      `DF Download starting: ${dfContent.title}`,
      `${dfContent.name}:\n\n${this.toSummary(dfContent, mediaInfo)}`
    );
  }
  notifyNewContentDetected(contentName: string): void {
    this.sendPush(contentName, `DF New Content Detected: ${contentName}`, `DF New Content Detected: ${contentName}`);
  }
  notifyDownloadQueued(dfContent: DfContent): void {
    this.sendPush(dfContent.name, `DF Download Queued: ${dfContent.title}`, `DF Download Queued: ${dfContent.title}`);
  }
  downloadProgressUpdate(dfContent: DfContent, mediaInfo: MediaInfo, progressUpdate: DownloadProgressReport): void {}
  downloadEnded(dfContentName: string): void {
    this.contentMap.delete(dfContentName);
  }
}
