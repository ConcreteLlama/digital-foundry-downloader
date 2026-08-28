import { createTheme, Theme } from "@mui/material/styles";
import { UiPalette } from "df-downloader-common/config/ui-config";

/**
 * One factory, one set of component overrides, parameterised by a palette.
 *
 * Two rules drive most of what's below:
 *
 *  1. Surfaces are separated by hairlines, not by brightness. MUI's dark mode
 *     lightens every elevated surface with an overlay gradient, so a card
 *     inside a dialog inside a page reads as three different greys. That
 *     overlay is switched off (MuiPaper backgroundImage: "none") and panels
 *     are divided by 1px borders instead, which keeps dense layouts readable.
 *  2. Figures are monospaced and tabular - speeds, sizes, ETAs, percentages.
 *     Progress readouts stop jittering as digit widths change, and columns of
 *     numbers line up for free. Components opt in with
 *     `sx={{ fontFamily: monoFontFamily }}`.
 *
 * Everything here reads from the palette. Nothing below hardcodes a colour, so
 * a new palette is a data change and never a change to this file.
 */

const uiFontFamily = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif";

/** Exposed so components rendering figures can opt into tabular numerals. */
export const monoFontFamily = "'JetBrains Mono Variable', 'SFMono-Regular', Consolas, monospace";

export const buildTheme = (p: UiPalette): Theme =>
  createTheme({
    palette: {
      mode: p.mode,
      primary: {
        main: p.accent,
        contrastText: p.accentInk,
      },
      secondary: {
        main: p.accent2,
      },
      background: {
        default: p.bg,
        paper: p.surface,
      },
      divider: p.line,
      text: {
        primary: p.ink,
        secondary: p.ink2,
        disabled: p.ink3,
      },
      error: { main: p.err },
      warning: { main: p.warn },
      info: { main: p.accent2 },
      success: { main: p.ok },
      // MUI derives action colours from mode alone, which leaves disabled
      // controls too faint on the light palette and too bright on the dark
      // ones. Tie them to the palette's own muted ink instead.
      action: {
        disabled: p.ink3,
        active: p.ink2,
      },
    },

    shape: {
      borderRadius: 6,
    },

    /*
     * Tuned for a dense admin tool. MUI's stock ramp tops out at h1 6rem, which
     * nothing here has ever rendered at - the largest heading in the app is a
     * dialog title. Everything is pulled down to sizes that are actually used,
     * with tighter tracking on the large end where the default looks loose.
     */
    typography: {
      fontFamily: uiFontFamily,
      h1: { fontSize: "2rem", fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" },
      h2: { fontSize: "1.625rem", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.015em" },
      h3: { fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.01em" },
      h4: { fontSize: "1.1875rem", fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em" },
      h5: { fontSize: "1.0625rem", fontWeight: 600, lineHeight: 1.4 },
      h6: { fontSize: "0.9375rem", fontWeight: 600, lineHeight: 1.45 },
      subtitle1: { fontSize: "0.9375rem", fontWeight: 500, lineHeight: 1.5 },
      subtitle2: { fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.5 },
      body1: { fontSize: "0.9375rem", lineHeight: 1.55 },
      body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
      button: { fontSize: "0.8125rem", fontWeight: 600, letterSpacing: "0.01em" },
      caption: { fontSize: "0.75rem", lineHeight: 1.45, color: p.ink2 },
      overline: {
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.08em",
        lineHeight: 1.4,
        color: p.ink2,
      },
    },

    components: {
      /*
       * Scrollbar styling lives here rather than in a helper module that
       * callers spread into sx. The helper baked palette values in at import
       * time, which froze them to whichever theme happened to load first.
       * Anything that wants a visible scrollbar now just gets one.
       */
      MuiCssBaseline: {
        styleOverrides: {
          "*::-webkit-scrollbar": {
            width: 8,
            height: 8,
          },
          "*::-webkit-scrollbar-track": {
            background: p.bg2,
          },
          "*::-webkit-scrollbar-thumb": {
            background: p.line2,
            borderRadius: 4,
          },
          "*::-webkit-scrollbar-thumb:hover": {
            background: p.ink3,
          },
          "*": {
            scrollbarWidth: "thin",
            scrollbarColor: `${p.line2} ${p.bg2}`,
          },
          body: {
            backgroundColor: p.bg,
          },
        },
      },

      /*
       * The single highest-impact override here: MUI paints an alpha-white
       * gradient onto every elevated Paper in dark mode, so nesting surfaces
       * stacks up brightness. Killing it puts everything on the same ground
       * and lets borders do the separating.
       */
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
          outlined: {
            borderColor: p.line,
          },
        },
      },

      MuiCard: {
        defaultProps: {
          elevation: 0,
          variant: "outlined",
        },
        styleOverrides: {
          root: {
            backgroundColor: p.surface,
            borderColor: p.line,
          },
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: p.surface,
            backgroundImage: "none",
            color: p.ink,
            borderBottom: `1px solid ${p.line}`,
            boxShadow: "none",
          },
        },
      },

      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: p.surface,
            backgroundImage: "none",
            borderRight: `1px solid ${p.line}`,
          },
        },
      },

      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            textTransform: "none",
          },
          outlined: {
            borderColor: p.line2,
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 600,
            fontSize: "0.6875rem",
            letterSpacing: "0.02em",
            height: 22,
          },
          outlined: {
            borderColor: p.line2,
          },
          label: {
            paddingLeft: 8,
            paddingRight: 8,
          },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundColor: p.surface,
            border: `1px solid ${p.line}`,
            backgroundImage: "none",
          },
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontSize: "1.0625rem",
            fontWeight: 600,
            letterSpacing: "-0.01em",
          },
        },
      },

      MuiTextField: {
        defaultProps: {
          size: "small",
          variant: "outlined",
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          notchedOutline: {
            borderColor: p.line2,
          },
        },
      },

      MuiTooltip: {
        defaultProps: {
          arrow: true,
        },
        styleOverrides: {
          tooltip: {
            backgroundColor: p.surface3,
            border: `1px solid ${p.line}`,
            fontSize: "0.75rem",
            fontWeight: 400,
            color: p.ink,
          },
          arrow: {
            color: p.surface3,
          },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: 4,
            borderRadius: 2,
            backgroundColor: p.surface3,
          },
          bar: {
            borderRadius: 2,
          },
        },
      },

      /*
       * The stepper carries pipeline state, so it needs to read as an
       * instrument rather than a wizard: thin connectors, small labels, and
       * colour only where a step is actually active or finished.
       */
      MuiStepper: {
        styleOverrides: {
          root: {
            padding: 0,
          },
        },
      },
      MuiStepConnector: {
        styleOverrides: {
          line: {
            borderColor: p.line,
          },
        },
      },
      MuiStepLabel: {
        styleOverrides: {
          label: {
            fontSize: "0.8125rem",
            "&.Mui-active": { fontWeight: 600 },
            "&.Mui-completed": { color: p.ink2 },
          },
        },
      },

      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: p.line,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottomColor: p.line,
          },
        },
      },
    },
  });
