import { z } from "zod";

export const PushbulletConfig = z.object({
  apiKey: z.string(),
});
export type PushbulletConfig = z.infer<typeof PushbulletConfig>;

export const NotificationService = z.enum(["pushbullet"]);
export type NotificationService = z.infer<typeof NotificationService>;

export const NotificationType = z.enum([
  "DOWNLOAD_COMPLETE",
  "DOWNLOAD_FAILED",
  "DOWNLOAD_STARTING",
  "NEW_CONTENT_DETECTED",
  "DOWNLOAD_QUEUED",
  "USER_NOT_SIGNED_IN",
  "USER_SIGNED_IN",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationsConfig = z
  .object({
    subscribedNotifications: z.array(NotificationType).default([]),
    notificationService: NotificationService.optional(),
    pushbullet: PushbulletConfig.optional(),
  })
  .refine(
    (args) => (args.notificationService ? args[args.notificationService] : true),
    (args) => ({
      message: `Notification service set to ${args.notificationService} but ${args.notificationService} not set`,
    })
  );
export type NotificationsConfig = z.infer<typeof NotificationsConfig>;
export const NotificationsConfigKey = "notifications";
