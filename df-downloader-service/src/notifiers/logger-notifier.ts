import { DfContentInfo, DfNotificationType, DownloadProgressInfo, MediaInfo } from "df-downloader-common";
import { DfNotificationConsumer } from "./notification-consumer.js";
import { LogLevel, logger } from "df-downloader-common";
import { downloadProgressToString } from "../utils/downloader.js";

export class LoggerDfNotifier extends DfNotificationConsumer {
  constructor(private logLevel: LogLevel, ...subscribedNotifications: DfNotificationType[]) {
    super("logger", ...subscribedNotifications);
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
  notifyPasswordReset(token: string, resetUrl: string, expiryTime: Date): void {
    logger.log(this.logLevel, `Password reset requested. Token: ${token} Reset URL: ${resetUrl} Expiry: ${expiryTime}`);
  }
}
