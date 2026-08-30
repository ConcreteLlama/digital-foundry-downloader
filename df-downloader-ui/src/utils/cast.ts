import { CastPlaybackUrls } from "df-downloader-common";

/**
 * The Google Cast sender SDK, wrapped in something typed and finite.
 *
 * The SDK is a global-mutating script from gstatic that announces itself by
 * calling a callback it expects to already exist on `window`. None of that
 * is worth spreading through components, so it is confined here and the rest
 * of the app sees three functions.
 *
 * Availability is genuinely conditional and not worth pretending otherwise:
 * the Web Sender API exists in desktop Chrome and Chromium-based Edge, and
 * not in Firefox, Safari, or Chrome on Android - where casting is done from
 * the browser's own menu instead. Everything here reports "no" rather than
 * throwing in those cases, and the button simply does not appear.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type CastGlobals = {
  cast?: any;
  chrome?: any;
  __onGCastApiAvailable?: (available: boolean) => void;
};

const globals = () => window as unknown as Window & CastGlobals;

const SDK_URL = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

let sdkPromise: Promise<boolean> | undefined;

/**
 * Loads the sender SDK once, resolving to whether Cast is usable here.
 *
 * Deliberately lazy - it is a third-party script, and there is no reason to
 * fetch it for someone who never opens a downloaded video. The promise is
 * cached so several players on a page share one load.
 */
export const loadCastSdk = (): Promise<boolean> => {
  if (sdkPromise) {
    return sdkPromise;
  }
  sdkPromise = new Promise<boolean>((resolve) => {
    const win = globals();
    if (win.cast?.framework) {
      resolve(true);
      return;
    }
    // The SDK calls this on arrival; it has to exist before the script runs.
    win.__onGCastApiAvailable = (available: boolean) => resolve(Boolean(available));
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    // A blocked or unreachable gstatic is a normal outcome (offline, an
    // extension, a locked-down network), not an error worth surfacing.
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return sdkPromise;
};

/**
 * Whether a receiver is around, as one answer shared by every button.
 *
 * This is deliberately a single subscription rather than one per component.
 * Two players can be mounted at once - the panel plays inline while the
 * dialog plays the same file - and when each discovered availability for
 * itself they could disagree, so the same file showed a Cast button in one
 * place and not the other. Discovery is asynchronous and the SDK reports
 * state through an event that has already fired by the time a later
 * subscriber arrives, which is exactly the shape that produces that.
 *
 * So: subscribe once, remember the last answer, and replay it immediately to
 * anything that asks later. Every button then agrees by construction rather
 * than by both happening to be listening at the right moment.
 */
let castable = false;
let started = false;
const listeners = new Set<(castable: boolean) => void>();

const publish = (next: boolean) => {
  castable = next;
  for (const listener of listeners) {
    listener(next);
  }
};

const startWatching = async () => {
  const ready = await loadCastSdk();
  if (!ready) {
    publish(false);
    return;
  }
  const { cast, chrome } = globals();
  const context = cast.framework.CastContext.getInstance();
  context.setOptions({
    // The stock receiver: it plays an mp4 from a URL with sideloaded
    // subtitle tracks, which is exactly and only what this needs. A custom
    // receiver would mean hosting and registering a receiver app for no gain.
    receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });
  const stateFor = (state: string) => state !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
  context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (event: any) =>
    publish(stateFor(event.castState))
  );
  publish(stateFor(context.getCastState()));
};

/**
 * Reports cast availability now and whenever it changes.
 *
 * Fires immediately with what is already known, so a component mounting
 * after discovery has finished is not left waiting for an event that will
 * never come again.
 */
export const subscribeCastAvailability = (onChange: (castable: boolean) => void): (() => void) => {
  listeners.add(onChange);
  onChange(castable);
  if (!started) {
    started = true;
    void startWatching();
  }
  return () => {
    listeners.delete(onChange);
  };
};

/**
 * Hands one download to whichever receiver the user picks.
 *
 * Reuses an existing session when there is one, so casting a second video
 * does not ask which device again.
 */
export const castMedia = async (urls: CastPlaybackUrls, startSeconds = 0): Promise<void> => {
  const ready = await loadCastSdk();
  if (!ready) {
    throw new Error("Casting is not available in this browser");
  }
  const { cast, chrome } = globals();
  const context = cast.framework.CastContext.getInstance();
  const session = context.getCurrentSession() ?? (await context.requestSession().then(() => context.getCurrentSession()));
  if (!session) {
    throw new Error("No cast device was selected");
  }

  const mediaInfo = new chrome.cast.media.MediaInfo(urls.streamUrl, urls.mimeType);
  mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED;
  if (urls.durationSeconds) {
    mediaInfo.duration = urls.durationSeconds;
  }
  const metadata = new chrome.cast.media.GenericMediaMetadata();
  metadata.title = urls.title;
  if (urls.thumbnailUrl) {
    metadata.images = [new chrome.cast.Image(urls.thumbnailUrl)];
  }
  mediaInfo.metadata = metadata;

  /*
    Subtitles are sideloaded - a separate fetch the receiver makes itself,
    which is why those URLs are signed and why the service answers them with
    CORS headers. Track ids are ours to choose and only have to be unique
    within this request.
  */
  mediaInfo.tracks = urls.subtitleTracks.map((track) => {
    const castTrack = new chrome.cast.media.Track(track.index + 1, chrome.cast.media.TrackType.TEXT);
    castTrack.trackContentId = track.url;
    castTrack.trackContentType = "text/vtt";
    castTrack.subtype = chrome.cast.media.TextTrackType.SUBTITLES;
    castTrack.name = track.label;
    castTrack.language = track.language;
    return castTrack;
  });

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.currentTime = Math.max(0, Math.floor(startSeconds));
  request.autoplay = true;
  // Turn the first subtitle track on, matching what in-app playback does.
  if (mediaInfo.tracks.length) {
    request.activeTrackIds = [mediaInfo.tracks[0].trackId];
  }
  await session.loadMedia(request);
};
