import { DefaultUiThemeName, uiPalettes, UiThemeName } from "df-downloader-common/config/ui-config";

/**
 * Browser-local UI preferences.
 *
 * The theme also lives in the service config (so it survives a browser change
 * and shows up in Settings), but localStorage is what gets read synchronously
 * on load - the config arrives over HTTP, and waiting for it would mean a
 * visible flash of the wrong theme on every page load.
 */
const THEME_KEY = "df-ui-theme";
const RAIL_KEY = "df-ui-rail";
const DENSITY_KEY = "df-ui-density";
const VIEW_KEY = "df-ui-view";
/**
 * The chosen palette's page background, cached so the inline script in
 * index.html can paint it before the bundle has even loaded. Storing the
 * resolved colour rather than a name->colour map keeps index.html free of
 * palette values, so a new palette still touches only ui-config.ts.
 */
const BG_KEY = "df-ui-bg";

export type RailState = "expanded" | "icon";
/** How much vertical room a library row gets. */
export type RowDensity = "comfortable" | "compact";
/** Library layout: one row per item, or a thumbnail grid. */
export type ContentView = "list" | "grid";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode, or storage disabled. Fall back to defaults rather than
    // taking the app down over a preference.
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* see read() */
  }
};

export const isThemeName = (value: unknown): value is UiThemeName =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(uiPalettes, value);

/** Whether the user has ever explicitly picked a theme in this browser. */
export const hasStoredThemeName = () => isThemeName(read(THEME_KEY));

export const getStoredThemeName = (): UiThemeName => {
  const stored = read(THEME_KEY);
  return isThemeName(stored) ? stored : DefaultUiThemeName;
};

export const storeThemeName = (name: UiThemeName) => {
  write(THEME_KEY, name);
  write(BG_KEY, uiPalettes[name].bg);
};

/** Keeps the pre-paint background in step when the theme came from config. */
export const storeThemeBackground = (name: UiThemeName) => write(BG_KEY, uiPalettes[name].bg);

export const getStoredRailState = (): RailState => (read(RAIL_KEY) === "icon" ? "icon" : "expanded");

export const storeRailState = (state: RailState) => write(RAIL_KEY, state);

export const getStoredDensity = (): RowDensity => (read(DENSITY_KEY) === "compact" ? "compact" : "comfortable");

export const storeDensity = (density: RowDensity) => write(DENSITY_KEY, density);

export const getStoredView = (): ContentView => (read(VIEW_KEY) === "grid" ? "grid" : "list");

export const storeView = (view: ContentView) => write(VIEW_KEY, view);
