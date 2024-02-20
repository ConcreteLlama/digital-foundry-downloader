import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { DfNotificationConsumer } from "../notifiers/notification-consumer.js";
import { logger } from "df-downloader-common";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _subtitleGenerators: SubtitleGenerator[] = [];
  private _notificationConsumers: DfNotificationConsumer[] = [];

  addSubtitleGenerator(subtitleGenerator: SubtitleGenerator) {
    this._subtitleGenerators.push(subtitleGenerator);
  }

  getSubtitleGenerator(service: SubtitlesService) {
    return this._subtitleGenerators.find((subtitleGenerator) => subtitleGenerator.serviceType === service);
  }

  setSubtitleGenerators(subtitleGenerators: SubtitleGenerator[]) {
    this._subtitleGenerators = subtitleGenerators;
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
