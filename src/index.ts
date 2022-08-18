import { config } from "./config.js";
import { DigitalFoundryContentManager } from "./df-content-manager.js";
import { AllNotifications, DfNotificationType, LoggerDfNotifier, PushBulletNotifier } from "./df-notifier.js";
import { ensureEnvStringArray } from "./helper.js";
import { LogLevel } from "./logger.js";
import { makeRoutes } from "./routes.js";

async function start() {
  const dfVideoManager = new DigitalFoundryContentManager(config);
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
  dfVideoManager.start();
}

start();
