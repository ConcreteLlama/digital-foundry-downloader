import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { AiAnalysisConfig, AiAnalysisConfigUtils, AiProviderId } from "df-downloader-common/config/ai-analysis-config";

/**
 * Which engine runs this analysis, chosen per run.
 *
 * Renders nothing at all when only one engine is set up, which is the normal
 * case. A choice between one thing is not a choice - it is a control that has
 * to be read, understood and dismissed before getting to the button, every
 * time. So it appears exactly when it means something.
 *
 * Like the source picker beside it, a selection here applies to this run only
 * and never writes back to config: the settings say what you normally want,
 * this is for the times you want something else once.
 */

const LABELS: Record<AiProviderId, { label: string; tooltip: string }> = {
  anthropic: {
    label: "Claude",
    tooltip:
      "Analyse via the Anthropic API. Fast and the most thorough, and it costs a few pence a video - the estimate below says how much.",
  },
  local: {
    label: "On this machine",
    tooltip:
      "Analyse locally. Costs nothing to run and nothing leaves the machine, but it is considerably slower and the results are a little less complete.",
  },
};

export const AnalysisProviderPicker = ({
  value,
  onChange,
  config,
  disabled,
}: {
  /** Absent means the configured default, which is what the chips show as selected. */
  value?: AiProviderId;
  onChange: (value: AiProviderId) => void;
  config?: AiAnalysisConfig;
  disabled?: boolean;
}) => {
  const usable = AiAnalysisConfigUtils.usableProviders(config);
  if (usable.length < 2) {
    return null;
  }
  const selected = value ?? config?.defaultProvider ?? usable[0];
  return (
    <Box>
      <Typography variant="overline" sx={{ color: "text.disabled" }}>
        Analyse with
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        {usable.map((provider) => {
          const on = provider === selected;
          return (
            <Tooltip key={provider} title={LABELS[provider].tooltip}>
              <span>
                <Chip
                  size="small"
                  label={LABELS[provider].label}
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
                  disabled={disabled}
                  onClick={() => onChange(provider)}
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
    </Box>
  );
};
