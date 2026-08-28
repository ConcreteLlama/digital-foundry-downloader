import { z } from "zod";
import { DfNotificationType } from "../models/notification.js";

export const NotificationsServiceConfig = z.object({
  /** Whether to enable notifications for this service */
  enabled: z.boolean().describe("Send notifications through this service."),
  /** The notifications to send */
  subscribedNotifications: z
    .array(z.nativeEnum(DfNotificationType))
    .min(1)
    .describe("Which events are worth being told about. At least one has to be picked."),
});
export type NotificationsServiceConfig = z.infer<typeof NotificationsServiceConfig>;

export const PushbulletNotificationsConfig = NotificationsServiceConfig.extend({
  /** The Pushbullet API key */
  apiKey: z.string().describe("Your Pushbullet access token, found under Settings in your Pushbullet account."),
});
export type PushbulletNotificationsConfig = z.infer<typeof PushbulletNotificationsConfig>;
export const PushbulletServiceKey = "pushbullet";

export const NotificationServiceTypes = [PushbulletServiceKey] as const;
export type NotificationServiceType = (typeof NotificationServiceTypes)[number];

export const NotificationsConfig = z.object({
  services: z
    .object({
      [PushbulletServiceKey]: PushbulletNotificationsConfig.optional(),
    })
    .optional(),
});
export type NotificationsConfig = z.infer<typeof NotificationsConfig>;
export const NotificationsConfigKey = "notifications";

export const AllNotificationServiceKeys = [PushbulletServiceKey];
