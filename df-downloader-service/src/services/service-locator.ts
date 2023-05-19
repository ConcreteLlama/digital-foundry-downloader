import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { DfNotificationConsumer } from "../notifiers/notification-consumer.js";
import { logger } from "df-downloader-common";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _subtitleGenerator?: SubtitleGenerator;
  private _notificationConsumers: DfNotificationConsumer[] = [];

  set subtitleGenerator(subtitleGenerator: SubtitleGenerator | undefined) {
    this._subtitleGenerator = subtitleGenerator;
  }

  get subtitleGenerator() {
    return this._subtitleGenerator;
  }

  set notificationConsumers(notificationConsumers: DfNotificationConsumer[]) {
    this._notificationConsumers = notificationConsumers;
    logger.log("info", `Updated notification consumers to ${notificationConsumers.map((c) => c.name).join(", ")}`);
  }

  get notificationConsumers() {
    return this._notificationConsumers;
  }
}

export const serviceLocator = ServiceLocator.instance;
