import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Accordion, AccordionDetails, AccordionSummary, Box, Chip, Stack, Typography, alpha } from "@mui/material";

/**
 * What each combination of sources actually buys you.
 *
 * Shown where the decision is made - about to spend money on a run - rather
 * than in documentation nobody opens at that moment. The distinction that
 * matters most is not "more is better" but that there is a hard step between
 * the second and third rows: with neither a transcript nor an article there
 * is nothing to summarise from, so those runs produce no summary, no verdict
 * and no structured data however good the title is.
 *
 * Collapsed by default. It answers a question people ask once and then know.
 */

type Tier = {
  sources: string[];
  /** True for the tiers that cannot produce a summary - see tagsOnly in analyse.ts. */
  limited?: boolean;
  gets: string;
  note?: string;
};

const TIERS: Tier[] = [
  {
    sources: ["Title"],
    limited: true,
    gets: "Content type, the game it is about, and suggested tags.",
    note: "No summary, verdict or structured data - there is nothing to read yet. Descriptions are fetched from YouTube only when something needs one, so an item you have never opened or downloaded often sits here.",
  },
  {
    sources: ["Title", "Description"],
    limited: true,
    gets: "The same, but better founded - the description usually names the platforms and the angle.",
    note: "Still no summary or verdict. This is the cheapest run there is, and the one that works across your whole library rather than only what you have downloaded.",
  },
  {
    sources: ["Title", "Description", "Article"],
    gets: "Full analysis: summary, verdict, and the structured breakdown for its type.",
    note: "Written rather than transcribed, so product names, studios and figures are right. No jump-to timestamps though - a quote from an article cannot be located in the video.",
  },
  {
    sources: ["Title", "Description", "Subtitles"],
    gets: "Full analysis, plus every finding anchored to the moment it was said.",
    note: "Machine transcription garbles jargon, product names and the odd digit, so figures are less reliable than an article's.",
  },
  {
    sources: ["Title", "Description", "Subtitles", "Article"],
    gets: "Everything, and the most accurate of the five.",
    note: "The article settles any disagreement over a name or a number, the transcript supplies what the article does not cover and the timestamps to jump to.",
  },
];

export const AnalysisSourcesExplainer = () => (
  <Accordion
    disableGutters
    variant="outlined"
    sx={(theme) => ({
      borderRadius: 1.5,
      overflow: "hidden",
      "&:before": { display: "none" },
      borderLeft: `3px solid ${alpha(theme.palette.primary.main, 0.85)}`,
    })}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      sx={(theme) => ({ backgroundColor: alpha(theme.palette.primary.main, 0.09) })}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        What each source adds
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Stack spacing={1.5}>
        {TIERS.map((tier) => (
          <Box key={tier.sources.join("+")}>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.5 }}>
              {tier.sources.map((source) => (
                <Chip
                  key={source}
                  size="small"
                  variant="outlined"
                  label={source}
                  sx={{
                    height: 20,
                    fontSize: "0.65rem",
                    // The two thin tiers are marked as such rather than just
                    // being shorter rows - the step between them and the rest
                    // is the whole point of the table.
                    color: tier.limited ? "text.disabled" : "primary.main",
                    borderColor: tier.limited ? "divider" : "primary.main",
                  }}
                />
              ))}
              {tier.limited && (
                <Chip
                  size="small"
                  label="tags only"
                  sx={{ height: 20, fontSize: "0.65rem", color: "warning.main", bgcolor: "transparent" }}
                  variant="outlined"
                />
              )}
            </Stack>
            <Typography variant="body2">{tier.gets}</Typography>
            {tier.note && (
              <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
                {tier.note}
              </Typography>
            )}
          </Box>
        ))}
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          A transcript longer than the configured limit is dropped rather than cut short, since half a
          transcript reads as a complete analysis while missing whatever was in the back half - usually the
          verdict. That run falls back to the tier above it.
        </Typography>
      </Stack>
    </AccordionDetails>
  </Accordion>
);
