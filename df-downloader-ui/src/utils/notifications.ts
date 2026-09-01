import { VariantType } from "notistack";

/**
 * Every notification the app raises, whether or not it was shown as a toast.
 *
 * Queueing a few hundred subtitle jobs produces a few hundred notifications,
 * and even grouped that is a lot of things flying past the corner of the
 * screen. The answer is not to throw them away - a failure that never
 * surfaced is worse than a noisy one - so they are all recorded here and the
 * toast becomes the optional part.
 *
 * Errors are the exception and always toast, whatever the setting says.
 * Silently swallowing the one notification that means something is broken is
 * the failure mode this whole feature could easily introduce.
 */

export type NotificationMode = "all" | "errors" | "none";

export type AppNotification = {
  id: number;
  message: string;
  variant: VariantType;
  at: Date;
  read: boolean;
};

/** Kept short: this is a recent-activity list, not an audit log. */
const MAX_NOTIFICATIONS = 200;

const MODE_KEY = "df-ui-notification-mode";
const SNOOZE_KEY = "df-ui-notification-snooze";

/**
 * Reading and writing both guarded: storage throws outright in some contexts
 * (private windows, blocked site data), and a preference is never worth
 * taking the app down for.
 */
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Preference not persisted - it still applies for this session.
  }
};

const isMode = (value: string | null): value is NotificationMode =>
  value === "all" || value === "errors" || value === "none";

let notifications: AppNotification[] = [];
let mode: NotificationMode = isMode(readStored(MODE_KEY)) ? (readStored(MODE_KEY) as NotificationMode) : "all";
let snoozedUntil = Number(readStored(SNOOZE_KEY)) || 0;
let nextId = 1;

const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((subscriber) => subscriber());

export const subscribeToNotifications = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

export const getNotifications = () => notifications;
export const getNotificationMode = () => mode;

/** Milliseconds left on the snooze, or 0 when not snoozed. */
export const getSnoozeRemaining = () => Math.max(0, snoozedUntil - Date.now());

export const getUnreadCount = () => notifications.filter((notification) => !notification.read).length;

export const setNotificationMode = (next: NotificationMode) => {
  mode = next;
  writeStored(MODE_KEY, next);
  notify();
};

export const snoozeNotifications = (durationMs: number) => {
  snoozedUntil = Date.now() + durationMs;
  writeStored(SNOOZE_KEY, String(snoozedUntil));
  notify();
};

export const cancelSnooze = () => {
  snoozedUntil = 0;
  writeStored(SNOOZE_KEY, null);
  notify();
};

export const markAllNotificationsRead = () => {
  notifications = notifications.map((notification) =>
    notification.read ? notification : { ...notification, read: true }
  );
  notify();
};

export const clearNotifications = () => {
  notifications = [];
  notify();
};

/**
 * Whether this one should also appear as a toast.
 *
 * Errors ignore both the mode and the snooze - see the note at the top.
 */
export const shouldToast = (variant: VariantType): boolean => {
  if (variant === "error") {
    return true;
  }
  if (mode === "none") {
    return false;
  }
  if (mode === "errors") {
    return false;
  }
  return getSnoozeRemaining() === 0;
};

/** Records one, newest first, and returns it. */
export const recordNotification = (message: string, variant: VariantType): AppNotification => {
  const notification: AppNotification = { id: nextId++, message, variant, at: new Date(), read: false };
  notifications = [notification, ...notifications].slice(0, MAX_NOTIFICATIONS);
  notify();
  return notification;
};
