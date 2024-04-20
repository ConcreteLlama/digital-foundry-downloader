import { DfContentInfo, DownloadProgressInfo, MediaInfo } from "df-downloader-common";
import { DfNotificationConsumer } from "./notification-consumer.js";

export class NotificationConsumerManager {
  private _notificationConsumers: DfNotificationConsumer[] = [];

  constructor() {}

  addNotificationConsumer(consumer: DfNotificationConsumer) {
    this._notificationConsumers.push(consumer);
  }

  getNotificationConsumers() {
    return this._notificationConsumers;
  }

  setNotificationConsumers(notificationConsumers: DfNotificationConsumer[]) {
    this._notificationConsumers = notificationConsumers;
  }

  downloadComplete(
    dfContent: DfContentInfo,
    mediaInfo: MediaInfo,
    fileLocation: string,
    finalProgressReport: DownloadProgressInfo | undefined
  ): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.downloadComplete(dfContent, mediaInfo, fileLocation, finalProgressReport);
    });
  }
  downloadFailed(...args: [dfContent: DfContentInfo, err: any]): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.downloadFailed(...args);
    });
  }
  downloadStarting(...args: [dfContent: DfContentInfo, mediaInfo: MediaInfo]): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.downloadStarting(...args);
    });
  }
  newContentDetected(...args: [contentName: string]): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.newContentDetected(...args);
    });
  }
  downloadQueued(...args: [dfContent: DfContentInfo]): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.downloadQueued(...args);
    });
  }
  userNotSignedIn(): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.userNotSignedIn();
    });
  }
  userSignedIn(username: string, tier: string): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.userSignedIn(username, tier);
    });
  }

  passwordReset(token: string, resetUrl: string, expiryTime: Date): void {
    this._notificationConsumers.forEach((consumer) => {
      consumer.passwordReset(token, resetUrl, expiryTime);
    });
  }
}
