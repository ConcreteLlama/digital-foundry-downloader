import { got } from "got";
import { DfNotificationConsumer } from "./notification-consumer.js";
import { DfContentInfo, DownloadProgressInfo, MediaInfo, DfNotificationType } from "df-downloader-common";
import { PushbulletNotificationsConfig } from "df-downloader-common/config/notifications-config";

export class PushBulletNotifier extends DfNotificationConsumer {
  contentMap: Map<string, string> = new Map<string, string>();

  static fromConfig(config: PushbulletNotificationsConfig) {
    return new PushBulletNotifier(config.apiKey, ...config.subscribedNotifications);
  }

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
