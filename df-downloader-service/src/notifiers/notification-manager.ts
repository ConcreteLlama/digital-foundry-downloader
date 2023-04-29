// TODO: This will eventually be replaced with an event emitter

import { AllNotifications } from "df-downloader-common";
import { DigitalFoundryContentManager } from "../df-content-manager.js";
import { LogLevel } from "../utils/logger.js";
import { LoggerDfNotifier } from "./logger-notifier.js";
import { serviceLocator } from "../services/service-locator.js";
import { PushBulletNotifier } from "./pushbullet-notifier.js";

//This is just a placeholder, will update to emitters
export const makeNotificationConsumers = (dfContentManager: DigitalFoundryContentManager) => {
  const loggerNotifier = new LoggerDfNotifier(LogLevel.INFO, ...AllNotifications);
  dfContentManager.addNotifier(loggerNotifier);

  const notificationServices = serviceLocator.config.notifications?.services;
  if (!notificationServices) {
    return;
  }
  if (notificationServices.pushbullet) {
    dfContentManager.addNotifier(PushBulletNotifier.fromConfig(notificationServices.pushbullet));
  }
};
