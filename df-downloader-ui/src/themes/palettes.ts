/**
 * The palettes themselves live in df-downloader-common, next to the config
 * schema whose `theme` enum is derived from their keys - that is what keeps
 * adding a new theme a single-file change. This module just re-exports them
 * under the name the UI reaches for.
 */
export { uiPalettes as palettes, uiThemeNames, DefaultUiThemeName } from "df-downloader-common/config/ui-config";
export type { UiPalette as Palette, UiThemeName as PaletteName } from "df-downloader-common/config/ui-config";
