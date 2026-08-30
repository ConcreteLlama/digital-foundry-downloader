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

export const rememberPlaybackPosition = (downloadLocation: string, seconds: number) => {
  positions.set(downloadLocation, seconds);
};

export const rememberedPlaybackPosition = (downloadLocation: string) => positions.get(downloadLocation);
