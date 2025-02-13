import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { DfNotificationConsumer } from "../notifiers/notification-consumer.js";
import { logger, mapFilterEmpty } from "df-downloader-common";
import { NotificationConsumerManager } from "../notifiers/notification-consumer-manager.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _subtitleGenerators: SubtitleGenerator[] = [];
  private _notificationConsumerManager: NotificationConsumerManager = new NotificationConsumerManager();
  private _db!: DfDownloaderOperationalDb;

  addSubtitleGenerator(subtitleGenerator: SubtitleGenerator) {
    this._subtitleGenerators.push(subtitleGenerator);
  }

  getSubtitleGenerator(service: SubtitlesService) {
    return this._subtitleGenerators.find((subtitleGenerator) => subtitleGenerator.serviceType === service);
  }

  getSubtitleGenerators(services?: SubtitlesService[]) {
    if (services) {
      return mapFilterEmpty(services, (service) => this.getSubtitleGenerator(service));
    }
    return this._subtitleGenerators;
  }

  setSubtitleGenerators(subtitleGenerators: SubtitleGenerator[]) {
    this._subtitleGenerators = subtitleGenerators;
  }

  setNotificationConsumers(notificationConsumers: DfNotificationConsumer[]) {
    this._notificationConsumerManager.setNotificationConsumers(notificationConsumers);
    logger.log("info", `Updated notification consumers to ${notificationConsumers.map((c) => c.name).join(", ")}`);
  }

  setDb(db: DfDownloaderOperationalDb) {
    this._db = db;
  }

  get db() {
    return this._db;
  }

  get notifier() {
    return this._notificationConsumerManager;
  }
}

export const serviceLocator = ServiceLocator.instance;
