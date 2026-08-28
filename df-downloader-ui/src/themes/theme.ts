import { createTheme } from "@mui/material/styles";

/**
 * "Signal" - the app's one theme for now.
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
 *     `sx={{ fontFamily: monoFontFamily }}`; wiring that through the readouts
 *     themselves is a later step.
 *
 * NOTE: this module is imported as a singleton (`import { theme } from
 * "themes/theme"`) by ~19 components that read `theme.palette.*` and
 * `theme.breakpoints.*` at render time. Keep the export name and shape as-is;
 * converting those call sites to `useTheme()` is a separate piece of work and
 * is the prerequisite for ever swapping this object at runtime.
 */

const uiFontFamily = "'Archivo Variable', 'Helvetica Neue', Arial, sans-serif";

/** Exposed so components rendering figures can opt into tabular numerals. */
export const monoFontFamily = "'JetBrains Mono Variable', 'SFMono-Regular', Consolas, monospace";

const ink = "#e9eff6";
const ink2 = "#93a4b6";
const ink3 = "#5d6d7e";
const line = "#1c242f";
const accent = "#3fe0cf";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: accent,
      light: "#7defdf",
      dark: "#22a89a",
      contrastText: "#03130f",
    },
    secondary: {
      main: "#1e88e5",
    },
    background: {
      default: "#07090c",
      paper: "#0d1116",
    },
    divider: line,
    text: {
      primary: ink,
      secondary: ink2,
      disabled: ink3,
    },
    error: {
      main: "#f87171",
    },
    warning: {
      main: "#fbbf24",
    },
    info: {
      main: "#1e88e5",
    },
    success: {
      main: "#4ade80",
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
    caption: { fontSize: "0.75rem", lineHeight: 1.45, color: ink2 },
    overline: {
      fontSize: "0.6875rem",
      fontWeight: 600,
      letterSpacing: "0.08em",
      lineHeight: 1.4,
      color: ink2,
    },
  },

  components: {
    /*
     * The single highest-impact override here: MUI paints an alpha-white
     * gradient onto every elevated Paper in dark mode, so nesting surfaces
     * stacks up brightness. Killing it puts everything on the same near-black
     * and lets borders do the separating.
     */
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
        outlined: {
          borderColor: line,
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
          backgroundColor: "#0d1116",
          borderColor: line,
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
          borderColor: "#2a3542",
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
          borderColor: "#2a3542",
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
          backgroundColor: "#0d1116",
          border: `1px solid ${line}`,
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
          borderColor: "#2a3542",
        },
      },
    },

    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
      styleOverrides: {
        tooltip: {
          backgroundColor: "#1a232d",
          border: `1px solid ${line}`,
          fontSize: "0.75rem",
          fontWeight: 400,
          color: ink,
        },
        arrow: {
          color: "#1a232d",
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 4,
          borderRadius: 2,
          backgroundColor: "#1a232d",
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
          borderColor: line,
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          fontSize: "0.8125rem",
          "&.Mui-active": { fontWeight: 600 },
          "&.Mui-completed": { color: ink2 },
        },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: line,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: line,
        },
      },
    },
  },
});
