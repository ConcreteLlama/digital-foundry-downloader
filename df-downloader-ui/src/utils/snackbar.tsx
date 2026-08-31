import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Box, Button, IconButton, SvgIconProps, Typography } from "@mui/material";
import { Theme } from "@mui/material/styles";
import {
  closeSnackbar,
  CustomContentProps,
  enqueueSnackbar,
  OptionsObject,
  SnackbarContent,
  SnackbarKey,
  SnackbarProvider,
  VariantType,
} from "notistack";
import { forwardRef, useRef, useState } from "react";

/**
 * Toasts, built to the same rules as the rest of the app: a hairline-bordered
 * surface on the palette's own paper colour, with the severity carried by a
 * rule down the leading edge and a per-variant icon rather than by flooding the
 * whole background with colour. Notistack's stock filled bars are the exact
 * "colour as decoration" pattern everything else here avoids, and they are
 * fixed colours besides - unreadable on the light palette.
 *
 * The icon is not ornament: it is the second channel, so severity is never
 * encoded by colour alone.
 */

type VariantSpec = {
  Icon: React.ComponentType<SvgIconProps>;
  /**
   * Palette key for the edge rule and the icon. Left unset for the routine
   * acknowledgements, which stay greyscale - "queued a download" is not state
   * worth spending a signal colour on, and the icon still distinguishes it.
   */
  signal?: "success" | "warning" | "error";
  /** `null` means it stays on screen until it is dismissed. */
  autoHideDuration: number | null;
};

/**
 * One duration per variant rather than the flat 5s everything used to get.
 *
 * A failed download disappearing after five seconds - quite possibly while the
 * machine is unattended, which is the normal way this tool is used - loses the
 * only notice that anything went wrong, so errors now persist. Warnings cover
 * cancellations and partial outcomes: worth reading, not worth blocking on.
 * Acknowledgements are shortened, because several of them arrive at once when a
 * batch is queued and they are only confirming what was just clicked.
 */
const variantSpecs: Record<VariantType, VariantSpec> = {
  default: { Icon: InfoOutlinedIcon, autoHideDuration: 4000 },
  info: { Icon: InfoOutlinedIcon, autoHideDuration: 4000 },
  success: { Icon: CheckCircleOutlineIcon, signal: "success", autoHideDuration: 4000 },
  warning: { Icon: WarningAmberOutlinedIcon, signal: "warning", autoHideDuration: 10000 },
  error: { Icon: ErrorOutlineIcon, signal: "error", autoHideDuration: null },
};

const getVariantSpec = (variant: VariantType) => variantSpecs[variant] ?? variantSpecs.default;

const signalColor = (spec: VariantSpec) => (theme: Theme) =>
  spec.signal ? theme.palette[spec.signal].main : theme.palette.text.secondary;

/** How far a toast has to be dragged before letting go dismisses it. */
const SWIPE_DISMISS_PX = 72;
/** Past this, the gesture is a swipe and must not also register as a click. */
const SWIPE_CLICK_CANCEL_PX = 8;

const SignalSnackbar = forwardRef<HTMLDivElement, CustomContentProps>((props, ref) => {
  const { id, message, variant, action, persist, style, className } = props;
  /**
   * Swipe to dismiss.
   *
   * Persistent toasts are included, even though they deliberately refuse
   * click-to-dismiss. That rule exists so a stray click on a toast that drifted
   * under the cursor cannot lose an error report - a swipe is not something
   * that happens by accident, so it carries no such risk and is the obvious
   * gesture on the phone where these are most in the way.
   *
   * Pointer events rather than touch: the same handler covers a trackpad drag
   * and a finger, and setPointerCapture keeps the gesture alive when it leaves
   * the toast, which it will since the toast is moving out from under it.
   */
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ startX: number; moved: boolean } | null>(null);
  const spec = getVariantSpec(variant);
  const Icon = spec.Icon;
  const color = signalColor(spec);
  const resolvedAction = typeof action === "function" ? action(id) : action;
  // Errors and warnings interrupt; the rest are confirmations of something the
  // user just did, and announcing those assertively talks over a screen reader.
  const severe = variant === "error" || variant === "warning";
  return (
    <SnackbarContent ref={ref} role={severe ? "alert" : "status"} className={className} style={style}>
      <Box
        // Anything that auto-hides can also just be clicked away. Persistent
        // ones deliberately cannot - a stray click on a passing toast should not
        // be able to lose an error report - so they get an explicit close.
        onClick={() => {
          // A swipe ends in a pointerup over the toast, which the browser also
          // reports as a click; without this, dragging a persistent toast a few
          // pixels and letting go would dismiss it by the click path instead.
          if (gesture.current?.moved) {
            return;
          }
          if (!persist) {
            closeSnackbar(id);
          }
        }}
        onPointerDown={(event) => {
          // Not right-clicks, and not drags starting on the action button.
          if (event.button !== 0) {
            return;
          }
          gesture.current = { startX: event.clientX, moved: false };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!gesture.current) {
            return;
          }
          const delta = event.clientX - gesture.current.startX;
          if (Math.abs(delta) > SWIPE_CLICK_CANCEL_PX) {
            gesture.current.moved = true;
          }
          setDragX(delta);
        }}
        onPointerUp={(event) => {
          const delta = gesture.current ? event.clientX - gesture.current.startX : 0;
          setDragging(false);
          if (Math.abs(delta) >= SWIPE_DISMISS_PX) {
            // Carries on in the direction it was thrown rather than stopping
            // dead, then closes - the toast leaves the way it was pushed.
            setDragX(delta > 0 ? window.innerWidth : -window.innerWidth);
            closeSnackbar(id);
            return;
          }
          setDragX(0);
          // Cleared on a frame boundary so the click that follows this pointerup
          // still sees `moved` and can suppress itself.
          requestAnimationFrame(() => {
            gesture.current = null;
          });
        }}
        onPointerCancel={() => {
          setDragging(false);
          setDragX(0);
          gesture.current = null;
        }}
        sx={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          // Fades as it goes, so a half-committed swipe shows how close it is.
          opacity: dragX ? Math.max(0.25, 1 - Math.abs(dragX) / (SWIPE_DISMISS_PX * 2.5)) : 1,
          transition: dragging ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          // Vertical scrolling still belongs to the page; horizontal is ours.
          touchAction: "pan-y",
          // The stack's width is set on notistack's container in buildTheme, so
          // every toast is the same width; this just fills it.
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          minHeight: 44,
          paddingLeft: 1.25,
          paddingRight: 0.75,
          paddingY: 0.75,
          backgroundColor: "background.paper",
          border: (theme) => `1px solid ${theme.palette.divider}`,
          borderLeft: (theme) => `3px solid ${color(theme)}`,
          borderRadius: 1,
          // A toast floats over whatever is underneath it, so unlike the panels
          // in the page it does need to detach from its background - the
          // hairline alone will not do it over a busy list on the light palette.
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.32)",
          cursor: persist ? "default" : "pointer",
        }}
      >
        <Icon fontSize="small" sx={{ color, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ flex: "1 1 auto", minWidth: 0, color: "text.primary" }}>
          {message}
        </Typography>
        {(resolvedAction || persist) && (
          // Clicks on the controls must not also count as a click on the
          // surface, or pressing an action button would dismiss the toast out
          // from under whatever that button just started.
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            {resolvedAction}
            {persist && (
              <IconButton size="small" aria-label="Dismiss" onClick={() => closeSnackbar(id)} sx={{ color: "text.secondary" }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        )}
      </Box>
    </SnackbarContent>
  );
});
SignalSnackbar.displayName = "SignalSnackbar";

const snackbarComponents = {
  default: SignalSnackbar,
  info: SignalSnackbar,
  success: SignalSnackbar,
  warning: SignalSnackbar,
  error: SignalSnackbar,
};

/**
 * Anchored top-right. Notistack's default is bottom-left, which is now occupied
 * by the mobile tab bar and the manual-download button, so toasts landed on top
 * of both. Top-right is the one viewport edge with nothing fixed on it; the
 * offset that drops the stack clear of the app bar lives in `buildTheme`,
 * next to the rest of the global chrome.
 *
 * `maxSnack` is 4 rather than notistack's 3: errors persist now, so the stack
 * has to have room for one to sit while routine acknowledgements come and go
 * past it. It is a compromise rather than a fix - notistack evicts the oldest
 * snack once the limit is hit whether or not it is persistent - but four is as
 * many one-line toasts as fit on a phone without covering the page.
 */
export const AppSnackbarProvider = ({ children }: { children: React.ReactNode }) => (
  <SnackbarProvider
    maxSnack={4}
    anchorOrigin={{ vertical: "top", horizontal: "right" }}
    Components={snackbarComponents}
  >
    {children}
  </SnackbarProvider>
);

type SnackbarActionButtonProps = {
  text: string;
  onClick: (snackbarKey: SnackbarKey) => void;
};

const SnackbarActionButton = (
  props: SnackbarActionButtonProps & {
    snackbarKey: SnackbarKey;
  }
) => {
  return (
    <Button variant="text" color="primary" onClick={() => props.onClick(props.snackbarKey)} size="small">
      {props.text}
    </Button>
  );
};

type TriggerSnackbarOpts = OptionsObject & {
  actionButton?: SnackbarActionButtonProps | SnackbarActionButtonProps[];
};

export const triggerSnackbar = (message: string, snackbarProps: TriggerSnackbarOpts) => {
  const { actionButton, ...options } = snackbarProps;
  const variant: VariantType = options.variant || "info";
  const spec = getVariantSpec(variant);
  // No default "Dismiss" button any more. It appeared on every toast, ate the
  // width the message needed, and said nothing that the auto-hide and the
  // click-anywhere-to-close did not already cover; persistent toasts get a
  // compact close control in the content instead.
  const actionButtons: SnackbarActionButtonProps[] = actionButton
    ? Array.isArray(actionButton)
      ? actionButton
      : [actionButton]
    : [];
  const persist = spec.autoHideDuration === null;
  enqueueSnackbar(message, {
    persist,
    autoHideDuration: spec.autoHideDuration,
    action: actionButtons.length
      ? (key) =>
          actionButtons.map((button) => (
            <SnackbarActionButton
              key={button.text}
              snackbarKey={key}
              text={button.text}
              onClick={() => {
                closeSnackbar(key);
                button.onClick(key);
              }}
            />
          ))
      : undefined,
    ...options,
    // After the spread, not before: an explicit `variant: undefined` from a
    // caller would otherwise wipe out the resolved default.
    variant,
  });
};
