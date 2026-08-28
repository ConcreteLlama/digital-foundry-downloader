import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DownloadingIcon from "@mui/icons-material/Downloading";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LockIcon from "@mui/icons-material/Lock";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { SvgIconProps } from "@mui/material";
import { DfContentAvailability, DfContentEntry, DfContentEntryUtils } from "df-downloader-common";

export type ContentRowState =
  | "downloading"
  | "working"
  | "downloaded"
  | "available"
  | "needs-refresh"
  | "paywalled"
  | "unknown";

/**
 * How a state is drawn.
 *
 * THE RULE, and it is testable: every state must differ from every other on at
 * least TWO of - icon shape, spine pattern, dot fill, or >=20 greyscale levels.
 *
 * Colour on its own does almost nothing here. Measured on the shipped
 * palettes, the closest pair of state colours was 2 greyscale levels apart in
 * signal (downloading vs needs-refresh) and 3 in paper; in a light theme every
 * readable colour is dark by construction, so the whole set collapses into a
 * ~30-level band. Hue is therefore a nicety, not a channel.
 *
 * What actually carries state is structure: all seven icons are distinct, and
 * all seven spine patterns are distinct. That is two independent channels for
 * every possible pair, so the rule holds without relying on colour at all -
 * which is why it still holds in greyscale and in Paper.
 *
 * See content-row-state.spec-check (scripts/check-state-channels.mjs) for the
 * assertion that keeps this true.
 */
/** Every value here is used by exactly one state. */
export type SpinePattern =
  | "solid"
  | "pulse"
  | "dashed"
  | "dotted"
  | "hatch"
  | "sparse"
  | "none";

export type ContentRowStateSpec = {
  label: string;
  icon: React.FC<SvgIconProps>;
  /** Palette token for the spine, chip text and dot. */
  colour: string;
  /**
   * The spine's pattern. UNIQUE per state - that uniqueness is what makes the
   * pattern a channel in its own right rather than a decoration.
   */
  spine: SpinePattern;
  /** The dot's second channel: filled centre or hollow ring. */
  dot: "filled" | "hollow";
};

export const contentRowStateSpecs: Record<ContentRowState, ContentRowStateSpec> = {
  downloading: {
    label: "Downloading",
    icon: DownloadingIcon,
    colour: "primary.main",
    // Moving, so "happening now" reads without colour or even a percentage.
    spine: "pulse",
    dot: "filled",
  },
  working: {
    label: "Processing",
    icon: AutoFixHighIcon,
    colour: "primary.main",
    spine: "dashed",
    dot: "filled",
  },
  downloaded: {
    label: "Downloaded",
    icon: CheckCircleIcon,
    colour: "success.main",
    spine: "solid",
    dot: "filled",
  },
  available: {
    label: "Available",
    icon: SaveAltIcon,
    colour: "text.secondary",
    spine: "none",
    dot: "hollow",
  },
  "needs-refresh": {
    label: "Needs refresh",
    icon: SyncProblemIcon,
    colour: "warning.main",
    spine: "sparse",
    dot: "hollow",
  },
  paywalled: {
    label: "Paywalled",
    icon: LockIcon,
    colour: "text.disabled",
    spine: "hatch",
    dot: "hollow",
  },
  unknown: {
    label: "Unknown",
    icon: HelpOutlineIcon,
    colour: "text.disabled",
    spine: "dotted",
    dot: "hollow",
  },
};

/**
 * The state a row is in when nothing is actively running against it. Live
 * states come from the task pipelines and are layered on top by the row.
 */
export const getRestingRowState = (entry: DfContentEntry): ContentRowState => {
  if (DfContentEntryUtils.hasDownload(entry)) {
    return "downloaded";
  }
  // Checked before availability: a legacy entry's cached download link
  // predates the site migration and is probably dead, so "available" would be
  // a lie. Downloading one is already blocked in the service.
  if (entry.contentInfo.legacy) {
    return "needs-refresh";
  }
  switch (entry.statusInfo.availability) {
    case DfContentAvailability.PAYWALLED:
      return "paywalled";
    case DfContentAvailability.AVAILABLE:
      return "available";
    default:
      return "unknown";
  }
};

/** CSS for the 2px status spine, including its non-colour pattern. */
export const spineStyles = (spec: ContentRowStateSpec) => {
  switch (spec.spine) {
    case "none":
      return { backgroundColor: "transparent" as const };
    case "solid":
      return { backgroundColor: spec.colour };
    case "pulse":
      // Moving stripes: the only animated pattern, so "live" is legible even
      // with the page desaturated and the percentage unknown.
      return {
        backgroundColor: "transparent" as const,
        color: spec.colour,
        backgroundImage:
          "repeating-linear-gradient(to bottom, currentColor 0 6px, transparent 6px 12px)",
        backgroundSize: "100% 12px",
        animation: "df-spine-pulse 900ms linear infinite",
        "@keyframes df-spine-pulse": {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "0 12px" },
        },
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      };
    case "hatch":
      return {
        backgroundColor: "transparent" as const,
        color: spec.colour,
        backgroundImage:
          "repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 4px)",
      };
    default: {
      // Dashes and dots are drawn as a repeating gradient so the pattern
      // survives at 2px wide, where a real dashed border would not render
      // reliably. "sparse" is deliberately much airier than "dotted" so the
      // two read apart at a glance.
      const [on, off] = spec.spine === "dashed" ? [10, 6] : spec.spine === "sparse" ? [2, 12] : [3, 5];
      return {
        backgroundImage: `repeating-linear-gradient(to bottom, currentColor 0 ${on}px, transparent ${on}px ${
          on + off
        }px)`,
        color: spec.colour,
        backgroundColor: "transparent" as const,
      };
    }
  }
};
