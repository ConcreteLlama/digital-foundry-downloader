import { Box, Stack, SxProps, Tooltip, Typography } from "@mui/material";
import { monoFontFamily } from "../../../themes/build-theme";
import { contentRowStateSpecs, ContentRowStateSpec } from "./content-row-state";

/** Shared width so state reads as a column down the page, not a ragged edge. */
export const STATE_BLOCK_WIDTH = 152;

export type StateBlockProps = {
  spec: ContentRowStateSpec;
  /** Short line under the label - formats held, or what is running. */
  detail?: string;
  /** Extra pipelines beyond the one being described, if any. */
  extraCount?: number;
  align?: "start" | "end";
  /** Hides the detail line and tightens spacing, for the grid card. */
  compact?: boolean;
  sx?: SxProps;
};

/**
 * The dot + icon + label used wherever content state is shown - the library
 * row, the grid card and the detail modal.
 *
 * Extracted at the third call site rather than the second: the first two could
 * plausibly have diverged, three copies could not. Every state carries four
 * channels here (colour, icon, spine pattern elsewhere, dot fill) so it stays
 * readable in greyscale and across palettes - see content-row-state.ts.
 */
export const StateBlock = ({ spec, detail, extraCount, align = "end", compact, sx = {} }: StateBlockProps) => {
  const StateIcon = spec.icon;
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: "center",
        justifyContent: align === "end" ? "flex-end" : "flex-start",
        minWidth: 0,
        ...sx,
      }}
    >
      {/* Dot: filled or hollow, a channel independent of hue. */}
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          flexShrink: 0,
          backgroundColor: spec.dot === "filled" ? spec.colour : "transparent",
          border: spec.dot === "hollow" ? "1.5px solid" : "none",
          borderColor: spec.colour,
        }}
      />
      <StateIcon sx={{ fontSize: 14, color: spec.colour, flexShrink: 0 }} />
      <Tooltip title={detail ?? ""} disableHoverListener={!detail}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.6875rem", fontWeight: 600, color: spec.colour, lineHeight: 1.3 }}>
            {spec.label}
            {extraCount ? ` +${extraCount}` : ""}
          </Typography>
          {detail && !compact && (
            <Typography
              sx={{
                fontFamily: monoFontFamily,
                fontSize: "0.625rem",
                color: "text.disabled",
                lineHeight: 1.3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {detail}
            </Typography>
          )}
        </Box>
      </Tooltip>
    </Stack>
  );
};

/** Convenience for callers that only hold a state name. */
export const StateBlockFor = ({ state, ...rest }: { state: keyof typeof contentRowStateSpecs } & Omit<StateBlockProps, "spec">) => (
  <StateBlock spec={contentRowStateSpecs[state]} {...rest} />
);
