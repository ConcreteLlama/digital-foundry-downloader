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
 * Colour is deliberately only one of four channels. The palettes differ in how
 * far apart their accent, warn and err sit - foundry's amber accent is much
 * closer to its warn than signal's teal is - so a row whose state is carried
 * by hue alone is legible in one theme and ambiguous in another. Every state
 * therefore also has its own icon (shape), its own spine treatment (solid /
 * dashed / dotted / none), and a filled or hollow dot. Desaturate the page and
 * all seven remain distinguishable.
 */
export type ContentRowStateSpec = {
  label: string;
  icon: React.FC<SvgIconProps>;
  /** Palette token for the spine, chip text and dot. */
  colour: string;
  /** The spine's second channel: how the 2px edge is drawn. */
  spine: "solid" | "dashed" | "dotted" | "none";
  /** The dot's second channel: filled centre or hollow ring. */
  dot: "filled" | "hollow";
};

export const contentRowStateSpecs: Record<ContentRowState, ContentRowStateSpec> = {
  downloading: {
    label: "Downloading",
    icon: DownloadingIcon,
    colour: "primary.main",
    spine: "solid",
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
    spine: "dashed",
    dot: "hollow",
  },
  paywalled: {
    label: "Paywalled",
    icon: LockIcon,
    colour: "text.disabled",
    spine: "dotted",
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
  if (spec.spine === "none") {
    return { backgroundColor: "transparent" as const };
  }
  if (spec.spine === "solid") {
    return { backgroundColor: spec.colour };
  }
  // Dashes and dots are drawn as a repeating gradient so the pattern survives
  // at 2px wide, where a real dashed border would not render reliably.
  const [on, off] = spec.spine === "dashed" ? [10, 6] : [3, 5];
  return {
    backgroundImage: `repeating-linear-gradient(to bottom, currentColor 0 ${on}px, transparent ${on}px ${on + off}px)`,
    color: spec.colour,
    backgroundColor: "transparent" as const,
  };
};
