import "reflect-metadata";
import { config } from "./config/config.js";
import { DfLowDb } from "./db/df-operational-db-lowdb.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { AllNotifications, DfNotificationType, LoggerDfNotifier, PushBulletNotifier } from "./df-notifier.js";
import { LogLevel } from "./logger.js";
import { makeRoutes } from "./rest/routes.js";
import { ensureEnvStringArray } from "./utils/env-utils.js";

async function start() {
  const db = await DfLowDb.create();
  const firstRun = await db.init();
  const dfVideoManager = new DigitalFoundryContentManager(config, db);
  const loggerNotifier = new LoggerDfNotifier(config, LogLevel.INFO, ...AllNotifications);
  dfVideoManager.addNotifier(loggerNotifier);

  const pushbulletApiKey = process.env.PUSHBULLET_API_KEY;
  if (pushbulletApiKey) {
    const pushbulletSubscribedNotifications = ensureEnvStringArray("PUSHBULLET_SUBSCRIBED_NOTIFICATIONS");
    const pushbulletNotifier = new PushBulletNotifier(
      pushbulletApiKey,
      ...(pushbulletSubscribedNotifications.length === 0
        ? AllNotifications
        : pushbulletSubscribedNotifications.map(
            (notificationType) => DfNotificationType[<keyof typeof DfNotificationType>notificationType]
          ))
    );
    dfVideoManager.addNotifier(pushbulletNotifier);
  }
  if (config.httpEnabled) {
    makeRoutes(config, dfVideoManager);
  }
  await dfVideoManager.start(firstRun);
}
start();
