import { loadSubtitlesService } from "../media-utils/subtitles/subtitles.js";
import { loadNotificationConsumers } from "../notifiers/notification-manager.js";

export const loadServices = () => {
  loadSubtitlesService();
  loadNotificationConsumers();
};
