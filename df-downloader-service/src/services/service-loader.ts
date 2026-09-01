import { loadSubtitlesService } from "../media-utils/subtitles/subtitles.js";
import { loadNotificationConsumers } from "../notifiers/notification-manager.js";
import { loadMediaServers } from "../media-servers/media-server-loader.js";

export const loadServices = () => {
  loadSubtitlesService();
  loadNotificationConsumers();
  loadMediaServers();
};
