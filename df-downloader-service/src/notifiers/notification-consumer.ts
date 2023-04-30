import prettyBytes from "pretty-bytes";
import { DfContentInfo, MediaInfo, DownloadProgressInfo, DfNotificationType } from "df-downloader-common";

// TODO: Make a global typed event consumer/emitter rather than... whatever this is

export abstract class DfNotificationConsumer {
  subscribedNotifications: Set<DfNotificationType>;
  constructor(public readonly name: string, ...subscribedNotifications: DfNotificationType[]) {
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
