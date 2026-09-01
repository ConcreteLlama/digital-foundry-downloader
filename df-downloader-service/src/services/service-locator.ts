import { SubtitlesService } from "df-downloader-common/config/subtitles-config.js";
import { SubtitleGenerator } from "../media-utils/subtitles/subtitles.js";
import { DfNotificationConsumer } from "../notifiers/notification-consumer.js";
import { logger, mapFilterEmpty } from "df-downloader-common";
import { NotificationConsumerManager } from "../notifiers/notification-consumer-manager.js";
import { DfDownloaderOperationalDb } from "../db/df-operational-db.js";
import { ActivePipelineDb, CompletedPipelineDb } from "../db/file-dbs/pipeline-db.js";
import { MediaServerManager } from "../media-servers/media-server-manager.js";

class ServiceLocator {
  public static instance = new ServiceLocator();
  private _subtitleGenerators: SubtitleGenerator[] = [];
  private _notificationConsumerManager: NotificationConsumerManager = new NotificationConsumerManager();
  private _mediaServerManager: MediaServerManager = new MediaServerManager();
  private _db!: DfDownloaderOperationalDb;
  private _activePipelineDb?: ActivePipelineDb;
  private _completedPipelineDb?: CompletedPipelineDb;

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

  /**
   * Optional so anything constructing a task manager without a full startup
   * (tests, one-off scripts) still works - persistence is skipped rather
   * than crashing.
   */
  setPipelineDbs(active: ActivePipelineDb, completed: CompletedPipelineDb) {
    this._activePipelineDb = active;
    this._completedPipelineDb = completed;
  }

  get activePipelineDb() {
    return this._activePipelineDb;
  }

  get completedPipelineDb() {
    return this._completedPipelineDb;
  }

  get db() {
    return this._db;
  }

  get notifier() {
    return this._notificationConsumerManager;
  }

  /**
   * Media servers to tell when a file on disk changes.
   *
   * Always present, and a no-op until something is configured, so callers can
   * announce a change unconditionally rather than checking first.
   */
  get mediaServers() {
    return this._mediaServerManager;
  }
}

export const serviceLocator = ServiceLocator.instance;
