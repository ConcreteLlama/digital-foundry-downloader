import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { AiAnalysisSourceSelection } from "df-downloader-common";

/**
 * Which sources a run may read, chosen per run.
 *
 * The defaults come from the AI analysis settings, and a choice made here
 * applies to this run only - it never writes back to config. That split is
 * deliberate: the settings say what you normally want, and this is for the
 * times you want something else once, usually to spend less.
 *
 * Title and description are shown but cannot be switched off. They are always
 * read, cost almost nothing, and there would be nothing left to analyse
 * without them - but leaving them out of the list entirely implied the run
 * reads only the two things it does offer, which understated what is being
 * sent. Shown as fixed rather than as unchecked toggles, so the distinction
 * is between "always used" and "your choice" rather than on and off.
 */

export const DEFAULT_SOURCE_SELECTION: AiAnalysisSourceSelection = { transcript: true, article: true };

type SourceOption = {
  key: keyof AiAnalysisSourceSelection;
  label: string;
  /** What turning it on buys, and what turning it off costs. */
  tooltip: string;
};

/** Read on every run, whatever else is selected. Not choices. */
const ALWAYS_USED: { label: string; tooltip: string }[] = [
  { label: "Title", tooltip: "Always read. It is the most reliable statement of what the video is about." },
  {
    label: "Description",
    tooltip:
      "Always read when the item has one. Descriptions are fetched from YouTube only when something needs one, so an item never opened or downloaded may not have one yet.",
  },
];

const OPTIONS: SourceOption[] = [
  {
    key: "transcript",
    label: "Subtitles",
    tooltip:
      "The transcript. This is what makes a summary, a verdict and the structured breakdown possible, and what anchors findings to a timestamp - and it is nearly all of what a run costs. Without it the run returns tags and a classification only.",
  },
  {
    key: "article",
    label: "DF article",
    tooltip:
      "Digital Foundry's written article, where one is matched. Written rather than transcribed, so names and figures in it are right. Turning this off also stops the app looking one up.",
  },
];

export const AnalysisSourcePicker = ({
  value,
  onChange,
  /** Per item: what this content actually has. Omitted for a bulk run, which spans many. */
  available,
  disabled,
}: {
  value: AiAnalysisSourceSelection;
  onChange: (value: AiAnalysisSourceSelection) => void;
  available?: Partial<Record<keyof AiAnalysisSourceSelection, boolean>>;
  disabled?: boolean;
}) => {
  const nothingSelected = !value.transcript && !value.article;
  return (
    <Box>
      <Typography variant="overline" sx={{ color: "text.disabled" }}>
        Sources
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        {ALWAYS_USED.map((fixed) => (
          <Tooltip key={fixed.label} title={fixed.tooltip}>
            {/* Deliberately not a disabled toggle: disabled reads as "you
                cannot have this", where the truth is "you always do". */}
            <Chip
              size="small"
              label={fixed.label}
              variant="filled"
              sx={{
                height: 24,
                fontSize: "0.7rem",
                bgcolor: "action.hover",
                color: "text.secondary",
                cursor: "default",
              }}
            />
          </Tooltip>
        ))}
        {OPTIONS.map((option) => {
          // An item with no subtitles cannot use them however the toggle is
          // set, so it is shown off and explained rather than left looking
          // like a choice that will change the result.
          const missing = available ? available[option.key] === false : false;
          const on = value[option.key] && !missing;
          return (
            <Tooltip key={option.key} title={missing ? `This content has no ${option.label.toLowerCase()}` : option.tooltip}>
              <span>
                <Chip
                  size="small"
                  label={option.label}
                  /*
                   * color="primary" rather than a hand-set bgcolor.
                   *
                   * A clickable Chip carries its own hover and focus rules at
                   * .MuiChip-clickable:hover / :focus - two classes plus a
                   * pseudo-class, which outranks the single class sx emits. So
                   * a manual background lost to MUI's default grey the moment
                   * the chip was focused, and a tap leaves focus behind, which
                   * is why a selection went grey on a phone and looked fine on
                   * a desktop until you looked. Letting MUI own the palette
                   * makes hover and focus derive from primary too.
                   */
                  variant={on ? "filled" : "outlined"}
                  color={on ? "primary" : "default"}
                  disabled={disabled || missing}
                  onClick={() => onChange({ ...value, [option.key]: !value[option.key] })}
                  sx={{
                    height: 24,
                    fontSize: "0.7rem",
                    ...(on ? {} : { color: "text.secondary" }),
                  }}
                />
              </span>
            </Tooltip>
          );
        })}
      </Stack>
      {/* Not an error - it is a legitimate, and much cheaper, kind of run.
          But it changes what comes back enough to be worth saying outright
          rather than letting it be discovered afterwards. */}
      <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.disabled" }}>
        Title and description are always read. The rest is your choice.
      </Typography>
      {nothingSelected && (
        <Typography variant="caption" sx={{ display: "block", mt: 0.25, color: "warning.main" }}>
          With neither of those, this returns tags and a content type only - no summary, verdict or
          breakdown.
        </Typography>
      )}
    </Box>
  );
};
