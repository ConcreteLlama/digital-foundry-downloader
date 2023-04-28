import got from "got";
import prettyBytes from "pretty-bytes";
import { DfContentInfo, MediaInfo, DownloadProgressInfo } from "df-downloader-common";
import { downloadProgressToString } from "./utils/downloader.js";
import { LogLevel, logger } from "./utils/logger.js";

export enum DfNotificationType {
  DOWNLOAD_COMPLETE,
  DOWNLOAD_FAILED,
  DOWNLOAD_STARTING,
  NEW_CONTENT_DETECTED,
  DOWNLOAD_QUEUED,
  USER_NOT_SIGNED_IN,
  USER_SIGNED_IN,
}

export const AllNotifications: DfNotificationType[] = [
  DfNotificationType.DOWNLOAD_COMPLETE,
  DfNotificationType.DOWNLOAD_FAILED,
  DfNotificationType.DOWNLOAD_STARTING,
  DfNotificationType.NEW_CONTENT_DETECTED,
  DfNotificationType.DOWNLOAD_QUEUED,
  DfNotificationType.USER_NOT_SIGNED_IN,
  DfNotificationType.USER_SIGNED_IN,
];

export abstract class DfNotifier {
  subscribedNotifications: Set<DfNotificationType>;
  constructor(...subscribedNotifications: DfNotificationType[]) {
    this.subscribedNotifications = new Set<DfNotificationType>(subscribedNotifications);
  }

  downloadComplete(
    ...args: [
      dfContent: DfContentInfo,
      mediaInfo: MediaInfo,
      fileLocation: string,
      finalProgressReport: DownloadProgressInfo | undefined
    ]
  ): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_COMPLETE)) {
      this.notifyDownloadComplete(...args);
    }
    this.downloadEnded(args[0].name);
  }
  downloadFailed(...args: [dfContent: DfContentInfo, err: any]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_FAILED)) {
      this.notifyDownloadFailed(...args);
    }
    this.downloadEnded(args[0].name);
  }
  downloadStarting(...args: [dfContent: DfContentInfo, mediaInfo: MediaInfo]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_STARTING)) {
      this.notifyDownloadStarting(...args);
    }
  }
  newContentDetected(...args: [contentName: string]): void {
    if (this.subscribedNotifications.has(DfNotificationType.NEW_CONTENT_DETECTED)) {
      this.notifyNewContentDetected(...args);
    }
  }
  downloadQueued(...args: [dfContent: DfContentInfo]): void {
    if (this.subscribedNotifications.has(DfNotificationType.DOWNLOAD_QUEUED)) {
      this.notifyDownloadQueued(...args);
    }
  }
  userNotSignedIn(): void {
    if (this.subscribedNotifications.has(DfNotificationType.USER_NOT_SIGNED_IN)) {
      this.notifyUserNotSignedIn();
    }
  }
  userSignedIn(username: string, tier: string): void {
    if (this.subscribedNotifications.has(DfNotificationType.USER_SIGNED_IN)) {
      this.notifyUserSignedIn(username, tier);
    }
  }

  abstract downloadProgressUpdate(
    dfContent: DfContentInfo,
    mediaInfo: MediaInfo,
    progressUpdate: DownloadProgressInfo
  ): void;
  abstract notifyDownloadComplete(
    dfContent: DfContentInfo,
    mediaInfo: MediaInfo,
    fileLocation: string,
    currentProgress: DownloadProgressInfo | undefined
  ): void;
  abstract notifyDownloadFailed(dfContent: DfContentInfo, err: any): void;
  abstract notifyDownloadStarting(dfContent: DfContentInfo, mediaInfo: MediaInfo): void;
  abstract notifyNewContentDetected(contentName: string): void;
  abstract notifyDownloadQueued(dfContent: DfContentInfo): void;
  abstract downloadEnded(dfContentName: string): void;
  abstract notifyUserNotSignedIn(): void;
  abstract notifyUserSignedIn(username: string, tier: string): void;

  toSummary(dfContent: DfContentInfo, mediaInfo: MediaInfo, finalProgressReport?: DownloadProgressInfo) {
    let toReturn = `Title:          ${dfContent.title}
Published:      ${dfContent.publishedDate}
Media type:     ${mediaInfo.mediaType}
Size:           ${mediaInfo.size}
Description:    ${dfContent.description}`;
    if (finalProgressReport) {
      toReturn += `
Average speed:  ${prettyBytes(finalProgressReport.averageBytesPerSecond)}/s`;
    }
    return toReturn;
  }
}

export class LoggerDfNotifier extends DfNotifier {
  constructor(private logLevel: LogLevel, ...subscribedNotifications: DfNotificationType[]) {
    super(...subscribedNotifications);
  }

  notifyDownloadComplete(
    dfContent: DfContentInfo,
    mediaInfo: MediaInfo,
    fileLocation: string,
    finalProgressReport: DownloadProgressInfo | undefined
  ): void {
    logger.log(
      this.logLevel,
      `Download success ${dfContent.name}, downloaded to ${fileLocation}:\n\n${this.toSummary(
        dfContent,
        mediaInfo,
        finalProgressReport
      )}`
    );
  }
  notifyDownloadFailed(dfContent: DfContentInfo, err: any): void {
    logger.log(this.logLevel, `Download failed for ${dfContent.name}`, err);
  }
  notifyDownloadStarting(dfContent: DfContentInfo, mediaInfo: MediaInfo): void {
    logger.log(this.logLevel, `Download started for:\n\n${this.toSummary(dfContent, mediaInfo)}`);
  }
  notifyNewContentDetected(contentName: string): void {
    logger.log(this.logLevel, `New content detected: ${contentName}`);
  }
  notifyDownloadQueued(dfContent: DfContentInfo): void {
    logger.log(this.logLevel, `Download queued for ${dfContent.name}}`);
  }
  downloadProgressUpdate(dfContent: DfContentInfo, mediaInfo: MediaInfo, progressUpdate: DownloadProgressInfo): void {
    logger.log(this.logLevel, `Download ${dfContent.name} progress: ${downloadProgressToString(progressUpdate)}`);
  }
  downloadEnded(dfContentName: string): void {}
  notifyUserNotSignedIn(): void {
    logger.log(this.logLevel, `User not signed in`);
  }
  notifyUserSignedIn(username: string, tier: string): void {
    logger.log(this.logLevel, `DF Downloader user signed in. Username: ${username} Tier: ${tier}`);
  }
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

  notifyDownloadComplete(
    dfContent: DfContentInfo,
    mediaInfo: MediaInfo,
    fileLocation: string,
    finalProgressReport: DownloadProgressInfo | undefined
  ): void {
    this.sendPush(
      dfContent.name,
      `DF Downloaded: ${dfContent.title}`,
      `${dfContent.name}, downloaded to ${fileLocation}:\n\n${this.toSummary(
        dfContent,
        mediaInfo,
        finalProgressReport
      )}`,
      false
    );
    this.contentMap.delete(dfContent.name);
  }
  notifyDownloadFailed(dfContent: DfContentInfo, err: any): void {
    this.sendPush(
      dfContent.name,
      `DF Download failed: ${dfContent.title}`,
      `Download failed for ${dfContent.name}`,
      false
    );
    this.contentMap.delete(dfContent.name);
  }
  notifyDownloadStarting(dfContent: DfContentInfo, mediaInfo: MediaInfo): void {
    this.sendPush(
      dfContent.name,
      `DF Download starting: ${dfContent.title}`,
      `${dfContent.name}:\n\n${this.toSummary(dfContent, mediaInfo)}`
    );
  }
  notifyNewContentDetected(contentName: string): void {
    this.sendPush(contentName, `DF New Content Detected: ${contentName}`, `DF New Content Detected: ${contentName}`);
  }
  notifyDownloadQueued(dfContent: DfContentInfo): void {
    this.sendPush(dfContent.name, `DF Download Queued: ${dfContent.title}`, `DF Download Queued: ${dfContent.title}`);
  }
  downloadProgressUpdate(dfContent: DfContentInfo, mediaInfo: MediaInfo, progressUpdate: DownloadProgressInfo): void {}
  downloadEnded(dfContentName: string): void {
    this.contentMap.delete(dfContentName);
  }
  notifyUserNotSignedIn(): void {
    this.sendPush(
      "",
      `DF Downloader User not signed in`,
      "User not signed in on DF downloader - likely sessionid expired",
      false
    );
  }
  notifyUserSignedIn(username: string, tier: string): void {
    this.sendPush(
      "",
      `DF Downloader User signed in`,
      `DF Downloader user signed in. Username: ${username} Tier: ${tier}`,
      false
    );
  }
}
