import * as url from "url";
import path from "path";
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
process.chdir(path.join(__dirname, ".."));

import { DfLowDb } from "./db/df-operational-db-lowdb.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { AllNotifications, DfNotificationType, LoggerDfNotifier, PushBulletNotifier } from "./df-notifier.js";
import { LogLevel, logger } from "./utils/logger.js";
import { makeRoutes } from "./rest/routes.js";
import { ensureEnvString, ensureEnvStringArray } from "./utils/env-utils.js";
import { FileConfig } from "./config/file-config.js";
import { serviceLocator } from "./services/service-locator.js";

process
  .on("unhandledRejection", (reason, p) => {
    logger.log(LogLevel.ERROR, reason, "Unhandled promise rejection", p);
  })
  .on("uncaughtException", (err) => {
    logger.log(LogLevel.ERROR, "Uncaught exception", err);
  });

async function start() {
  const configDir = ensureEnvString("CONFIG_DIR", "config");
  const configService = await FileConfig.create(configDir);

  serviceLocator.configService = configService;

  const db = await DfLowDb.create();
  const dbInitInfo = await db.init();
  const dfContentManager = new DigitalFoundryContentManager(db);
  const loggerNotifier = new LoggerDfNotifier(LogLevel.INFO, ...AllNotifications);
  dfContentManager.addNotifier(loggerNotifier);

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
    dfContentManager.addNotifier(pushbulletNotifier);
  }
  if (serviceLocator.config.restApi) {
    makeRoutes(dfContentManager);
  }
  await dfContentManager.start(dbInitInfo);
}
start();
