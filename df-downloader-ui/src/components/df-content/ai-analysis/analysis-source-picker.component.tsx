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
 * Title and description are not offered. They are always read, cost almost
 * nothing, and there would be nothing left to analyse without them - a
 * control that can only be left on is noise.
 */

export const DEFAULT_SOURCE_SELECTION: AiAnalysisSourceSelection = { transcript: true, article: true };

type SourceOption = {
  key: keyof AiAnalysisSourceSelection;
  label: string;
  /** What turning it on buys, and what turning it off costs. */
  tooltip: string;
};

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
                  variant={on ? "filled" : "outlined"}
                  disabled={disabled || missing}
                  onClick={() => onChange({ ...value, [option.key]: !value[option.key] })}
                  sx={{
                    height: 24,
                    fontSize: "0.7rem",
                    ...(on
                      ? { bgcolor: "primary.main", color: "primary.contrastText" }
                      : { color: "text.secondary" }),
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
      {nothingSelected && (
        <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "warning.main" }}>
          Title and description only - this returns tags and a content type, with no summary, verdict or
          breakdown.
        </Typography>
      )}
    </Box>
  );
};
