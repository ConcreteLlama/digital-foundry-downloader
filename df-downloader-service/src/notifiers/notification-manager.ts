import { AllNotifications } from "df-downloader-common";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { LogLevel } from "../utils/logger.js";
import { LoggerDfNotifier } from "./logger-notifier.js";
import { PushBulletNotifier } from "./pushbullet-notifier.js";
import { configService } from "../config/config.js";
import { DfNotificationConsumer } from "./notification-consumer.js";
import { NotificationsConfig } from "df-downloader-common/config/notifications-config.js";
import { serviceLocator } from "../services/service-locator.js";

// TODO: I don't really like how any of this works, DfContentManager should be emitting events
// not looping the notification consumers and calling them directly

// Also this reconstructs the notification consumers every time the config changes, which is
// a bit inefficient, but it's not a big deal for now
const makeNotificationConsumers = (notificationsConfig: NotificationsConfig | undefined) => {
  const notificationConsumers: DfNotificationConsumer[] = [];
  const loggerNotifier = new LoggerDfNotifier(LogLevel.INFO, ...AllNotifications);
  notificationConsumers.push(loggerNotifier);

  const notificationServices = notificationsConfig?.services;
  if (notificationServices) {
    if (notificationServices.pushbullet) {
      notificationConsumers.push(PushBulletNotifier.fromConfig(notificationServices.pushbullet));
    }
  }
  return notificationConsumers;
};

export const loadNotificationConsumers = () => {
  //TODO: This is a bit brute force-ey and should probably be changed to only update the consumers that have changed
  serviceLocator.notificationConsumers = makeNotificationConsumers(configService.config.notifications);
  configService.on("configUpdated:notifications", (event) => {
    const config = event?.newValue;
    serviceLocator.notificationConsumers = makeNotificationConsumers(config);
  });
};
