import { got } from "got";
import { DfNotificationConsumer } from "./notification-consumer.js";
import { DfContentInfo, DownloadProgressInfo, MediaInfo, DfNotificationType, logger } from "df-downloader-common";
import { PushbulletNotificationsConfig } from "df-downloader-common/config/notifications-config";

export class PushBulletNotifier extends DfNotificationConsumer {
  static fromConfig(config: PushbulletNotificationsConfig) {
    return new PushBulletNotifier(config.apiKey, ...config.subscribedNotifications);
  }

  constructor(private apiKey: string, ...subscribedNotifications: DfNotificationType[]) {
    super("pushbullet", ...subscribedNotifications);
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
        logger.log("error", `Error sending pushbullet notification: ${e}`);
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
  }
  notifyDownloadFailed(dfContent: DfContentInfo, err: any): void {
    this.sendPush(
      dfContent.name,
      `DF Download failed: ${dfContent.title}`,
      `Download failed for ${dfContent.name}`,
      false
    );
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
  downloadEnded(dfContentName: string): void {}
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
  notifyPasswordReset(token: string, resetUrl: string, expiryTime: Date): void {
    this.sendPush(
      "",
      `DF Downloader Password Reset`,
      `To reset your password go here: ${resetUrl}\nIf that doesn't work you can enter the following token on the password reset page: ${token}\nExpires on ${expiryTime.toISOString()}`,
      false
    );
  }
}
