/**
 * Where you got to in each file, for as long as the tab is open.
 *
 * Moving around the app unmounts the player - closing the panel, switching
 * tabs, opening the same file in the player dialog - and each time it came
 * back at zero, so anything longer than a few minutes had to be found again
 * by hand.
 *
 * Deliberately a module-level Map rather than the Redux store or anything
 * persisted: nothing else needs to read it, it is worthless after a reload,
 * and writing a value every second into a store that notifies subscribers
 * would make every tick a render for everything watching.
 *
 * Keyed by the file's own location, which is what makes opening a *different*
 * video start at its own beginning rather than at the last one's position.
 */
const positions = new Map<string, number>();

/**
 * Who is watching each file's position.
 *
 * The same file can be open in more than one player at once - the panel
 * plays inline while the dialog plays the same download - and there are
 * several ways to open the second one. Wiring "catch up when the other
 * closes" into each of those routes individually is how they drift apart:
 * the route that was wired behaves one way, the ones that were not behave
 * another. So position is published instead, and any paused player showing
 * that file follows along on its own, whichever route opened it.
 */
type PositionListener = (seconds: number, source: symbol) => void;
const listeners = new Map<string, Set<PositionListener>>();

export const rememberPlaybackPosition = (downloadLocation: string, seconds: number, source: symbol) => {
  positions.set(downloadLocation, seconds);
  for (const listener of listeners.get(downloadLocation) ?? []) {
    listener(seconds, source);
  }
};

export const rememberedPlaybackPosition = (downloadLocation: string) => positions.get(downloadLocation);

export const subscribePlaybackPosition = (downloadLocation: string, listener: PositionListener): (() => void) => {
  const forLocation = listeners.get(downloadLocation) ?? new Set<PositionListener>();
  forLocation.add(listener);
  listeners.set(downloadLocation, forLocation);
  return () => {
    forLocation.delete(listener);
    if (!forLocation.size) {
      listeners.delete(downloadLocation);
    }
  };
};

/**
 * Every mounted player, so starting one can stop the others.
 *
 * Two copies of the same video playing over each other is never wanted, and
 * it was previously avoided only where someone remembered to - opening the
 * player from the content panel paused the inline copy, opening it from the
 * Files tab did not, and the video kept playing behind the dialog. One rule
 * for every player is both simpler and impossible to forget at a new call
 * site.
 */
const activePlayers = new Map<symbol, HTMLVideoElement>();

export const registerPlayer = (source: symbol, video: HTMLVideoElement): (() => void) => {
  activePlayers.set(source, video);
  return () => {
    activePlayers.delete(source);
  };
};

export const pauseOtherPlayers = (source: symbol) => {
  for (const [id, video] of activePlayers) {
    if (id !== source && !video.paused) {
      video.pause();
    }
  }
};
