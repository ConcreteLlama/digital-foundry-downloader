import { z } from "zod";

/**
 * UI theme palettes.
 *
 * A palette is plain data - no MUI, no CSS - so it can live here in the shared
 * package alongside the config schema that references it. That is what makes
 * adding a fourth theme a change to *this file only*: the zod enum the
 * settings form generates itself from is derived from the keys below, and the
 * UI's buildTheme() consumes the same objects. Put the palettes in the UI
 * package instead and the name list has to be duplicated here for the config
 * schema, which is exactly the seam that rots.
 *
 * Three ship deliberately, exercising both axes: "signal" and "foundry" are
 * both dark but differ in accent, so they test palette swapping; "paper" is
 * light, so it tests mode swapping.
 */
export type UiPalette = {
  /** Human-readable name, shown in the theme picker. */
  label: string;
  mode: "dark" | "light";
  /** Page background - the surface everything else sits on. */
  bg: string;
  /** A step further back than bg, for wells and inset areas. */
  bg2: string;
  /** Default panel/card surface. */
  surface: string;
  /** Raised surface - menus, tooltips, hover states. */
  surface2: string;
  /** Furthest-forward surface, for things overlaying a raised one. */
  surface3: string;
  /** Hairline divider. Surfaces are separated by these, not by brightness. */
  line: string;
  /** A more visible border, for interactive outlines. */
  line2: string;
  /** Primary text. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Disabled/tertiary text. */
  ink3: string;
  /** The one signal colour. Spent only on live or actionable state. */
  accent: string;
  /** A supporting non-semantic accent. Never used to encode state. */
  accent2: string;
  /** Text drawn on top of `accent`. */
  accentInk: string;
  ok: string;
  warn: string;
  err: string;
  /** Inert/queued state - present but not happening. */
  idle: string;
};

export const uiPalettes = {
  signal: {
    label: "Signal",
    mode: "dark",
    bg: "#07090c",
    bg2: "#040608",
    surface: "#0d1116",
    surface2: "#131a22",
    surface3: "#1a232d",
    line: "#1c242f",
    line2: "#2a3542",
    ink: "#e9eff6",
    ink2: "#93a4b6",
    ink3: "#5d6d7e",
    accent: "#3fe0cf",
    accent2: "#1e88e5",
    accentInk: "#03130f",
    ok: "#4ade80",
    warn: "#fbbf24",
    err: "#f87171",
    // Raised from #4b5b6b, which sat at 2.71:1 on the surface - below the 3:1
    // floor for non-text UI. Now 4.64:1.
    idle: "#6b8095",
  },
  foundry: {
    label: "Foundry",
    mode: "dark",
    bg: "#0b0806",
    bg2: "#070504",
    surface: "#141009",
    surface2: "#1d1710",
    surface3: "#272016",
    line: "#2a2117",
    line2: "#3a2e20",
    ink: "#f5eee3",
    ink2: "#b3a189",
    ink3: "#7b6b55",
    accent: "#ff8b3d",
    // Not the red it originally was - that value moved to `err` below, and a
    // supporting accent must never be mistakable for a state colour.
    accent2: "#c9752e",
    accentInk: "#1c0c02",
    // Foundry's accent is amber, which sits between yellow and red - the two
    // hues warn and err naturally want. Shipped as-is, a "needs refresh" row
    // and an active download would read as the same colour, which breaks the
    // whole "colour is signal" premise. So warn is pushed yellower AND much
    // paler than the accent (butter, not amber), err is pushed past scarlet
    // into crimson, and ok further into green so it does not then collide with
    // the new warn. Measured in CIELAB, the closest pair of state colours went
    // from dE 32 (accent/err) to dE 39 (ok/warn), which matches signal's 41.
    ok: "#7cc267",
    warn: "#f2e07a",
    err: "#e8455f",
    // Was #5e5140 at 2.46:1. Now 4.77:1.
    idle: "#8f7d64",
  },
  paper: {
    label: "Paper",
    mode: "light",
    bg: "#f3f0e8",
    bg2: "#e8e4d9",
    surface: "#fffdf8",
    surface2: "#f0ece2",
    surface3: "#e6e1d4",
    line: "#ddd7c8",
    line2: "#c9c2af",
    ink: "#1b1915",
    ink2: "#5e584b",
    // Light themes need disabled text darker than a naive inversion suggests -
    // #8b8375 on #fffdf8 is only ~3:1, so this is pulled down to stay legible.
    ink3: "#7a7263",
    // The proposal had accent and err both at #c8412a, which would have made a
    // failed step and a live one literally the same colour. Red is also the
    // wrong hue for "this is fine and running". So the accent takes the blue
    // and red goes back to meaning failure - closest state pair is now dE 40.
    accent: "#1f6f8b",
    accent2: "#6a4c93",
    accentInk: "#fff8f3",
    ok: "#2f7d51",
    warn: "#8a5a04",
    err: "#c8412a",
    // Was #a89f8d at 2.58:1. Now 3.64:1. Still the lightest token here, which
    // is correct for a light theme - "inert" reads as quieter, i.e. paler.
    idle: "#8d8472",
  },
} as const satisfies Record<string, UiPalette>;

export type UiThemeName = keyof typeof uiPalettes;

export const uiThemeNames = Object.keys(uiPalettes) as [UiThemeName, ...UiThemeName[]];

export const DefaultUiThemeName: UiThemeName = "signal";

export const UiConfig = z.object({
  /**
   * Which palette the interface uses.
   *
   * .catch() rather than bare .default(): a hand-edited config.yaml, or a
   * palette removed in a later version, would otherwise fail the whole config
   * parse and stop the service booting over a colour scheme. Same failure
   * shape as the YouTube subtitles service that needed a config patch to keep
   * existing installs starting.
   */
  theme: z
    .enum(uiThemeNames)
    .default(DefaultUiThemeName)
    .catch(DefaultUiThemeName)
    .describe("Applies straight away so you can see it. Save to keep it on other browsers too."),
});
export type UiConfig = z.infer<typeof UiConfig>;
export const UiConfigKey = "ui";
