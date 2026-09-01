import NotificationsIcon from "@mui/icons-material/Notifications";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import NotificationsPausedIcon from "@mui/icons-material/NotificationsPaused";
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Popover,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useState, useSyncExternalStore } from "react";
import {
  AppNotification,
  NotificationMode,
  cancelSnooze,
  clearNotifications,
  getNotificationMode,
  getNotifications,
  getSnoozeRemaining,
  getUnreadCount,
  markAllNotificationsRead,
  setNotificationMode,
  snoozeNotifications,
  subscribeToNotifications,
} from "../../utils/notifications.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * Everything the app has said, and the controls for how loudly it says it.
 *
 * The list is the point: with toasts turned down, this is where a message
 * goes instead of nowhere. Queueing three hundred jobs should not mean three
 * hundred interruptions, but it should not mean losing the one that failed
 * either.
 */

const MODE_LABELS: { value: NotificationMode; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Everything pops up as it happens." },
  {
    value: "errors",
    label: "Errors",
    hint: "Only failures interrupt. Everything else is still collected here.",
  },
  {
    value: "none",
    label: "None",
    hint: "Nothing pops up - except errors, which always do. Everything is still collected here.",
  },
];

const SNOOZE_OPTIONS = [
  { label: "15m", ms: 15 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "4h", ms: 4 * 60 * 60_000 },
];

const formatWhen = (at: Date) => {
  const seconds = Math.round((Date.now() - at.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

const toneFor = (variant: AppNotification["variant"]) => {
  switch (variant) {
    case "error":
      return "error.main";
    case "warning":
      return "warning.main";
    case "success":
      return "success.main";
    default:
      return "text.secondary";
  }
};

export const NotificationBell = () => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Re-renders on any change to the store - list, mode or snooze.
  const notifications = useSyncExternalStore(subscribeToNotifications, getNotifications);
  const unread = useSyncExternalStore(subscribeToNotifications, getUnreadCount);
  const mode = useSyncExternalStore(subscribeToNotifications, getNotificationMode);
  const snoozeRemaining = useSyncExternalStore(subscribeToNotifications, getSnoozeRemaining);
  const snoozed = snoozeRemaining > 0;

  const open = (event: React.MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget);
    // Opening is reading them - the badge is about what arrived while away.
    markAllNotificationsRead();
  };

  const quiet = mode !== "all" || snoozed;
  const Icon = mode === "none" ? NotificationsOffIcon : snoozed ? NotificationsPausedIcon : NotificationsIcon;
  const title = snoozed
    ? `Notifications snoozed for ${Math.ceil(snoozeRemaining / 60_000)} more minutes`
    : mode === "all"
      ? "Notifications"
      : `Notifications - ${MODE_LABELS.find((m) => m.value === mode)?.label.toLowerCase()} only`;

  return (
    <>
      <Tooltip title={title}>
        <IconButton size="small" onClick={open} aria-label="Notifications">
          <Badge
            badgeContent={unread}
            max={99}
            color="primary"
            // Nothing arrived is not worth a mark, and a zero badge on a
            // permanent icon is a permanent distraction.
            invisible={unread === 0}
          >
            <Icon fontSize="small" sx={{ color: quiet ? "text.disabled" : "text.secondary" }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: "95vw" } } }}
      >
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Typography variant="overline" sx={{ color: "text.disabled" }}>
            Pop up
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={mode}
            onChange={(_event, value: NotificationMode | null) => value && setNotificationMode(value)}
            sx={{ display: "flex", mt: 0.5 }}
          >
            {MODE_LABELS.map((option) => (
              <Tooltip key={option.value} title={option.hint}>
                <ToggleButton value={option.value} sx={{ flex: 1, textTransform: "none", py: 0.25 }}>
                  {option.label}
                </ToggleButton>
              </Tooltip>
            ))}
          </ToggleButtonGroup>

          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              {snoozed ? `Quiet for ${Math.ceil(snoozeRemaining / 60_000)}m` : "Snooze"}
            </Typography>
            {snoozed ? (
              <Button size="small" onClick={cancelSnooze} sx={{ py: 0 }}>
                Resume now
              </Button>
            ) : (
              SNOOZE_OPTIONS.map((option) => (
                <Button
                  key={option.label}
                  size="small"
                  variant="outlined"
                  onClick={() => snoozeNotifications(option.ms)}
                  sx={{ py: 0, minWidth: 0, px: 1 }}
                >
                  {option.label}
                </Button>
              ))
            )}
          </Stack>
          {/* Said plainly, because "off" that silently hides a failure would
              be a worse feature than no setting at all. */}
          <Typography variant="caption" sx={{ display: "block", mt: 0.75, color: "text.disabled" }}>
            Errors always pop up, and everything is collected here either way.
          </Typography>
        </Box>

        <Divider />

        {notifications.length === 0 ? (
          <Typography variant="body2" sx={{ p: 2, color: "text.disabled" }}>
            Nothing yet.
          </Typography>
        ) : (
          <>
            <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
              {notifications.map((notification) => (
                <Box
                  key={notification.id}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    borderBottom: 1,
                    borderColor: "divider",
                    borderLeft: 3,
                    borderLeftColor: toneFor(notification.variant),
                  }}
                >
                  <Typography variant="body2">{notification.message}</Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.disabled", fontFamily: monoFontFamily, fontSize: "0.65rem" }}
                  >
                    {formatWhen(notification.at)}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", p: 0.5 }}>
              <Button size="small" onClick={clearNotifications}>
                Clear
              </Button>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
};
