import { configService } from "../config/config.js";
import { serviceLocator } from "../services/service-locator.js";

/**
 * Keeps the media server manager in step with config.
 *
 * Same shape as loadNotificationConsumers, and rebuilt wholesale on change for
 * the same reason: the objects are cheap, and a token corrected in settings
 * should work on the next download rather than the next restart.
 */
export const loadMediaServers = () => {
  serviceLocator.mediaServers.configure(configService.config.mediaServers);
  configService.on("configUpdated:mediaServers", (event) => {
    serviceLocator.mediaServers.configure(event?.newValue);
  });
};
