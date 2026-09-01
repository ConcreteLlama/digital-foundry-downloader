import ArticleIcon from "@mui/icons-material/Article";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { Stack, Tooltip } from "@mui/material";
import { AiEvidenceSourceLabels, DfContentBadgeState } from "df-downloader-common";
import { useSelector } from "react-redux";
import { selectContentBadges } from "../../../store/df-content/df-content.selector.ts";

/**
 * What this installation has done to a row, as opposed to what the row is.
 *
 * Deliberately NOT part of ContentRowState. That is a single-valued channel
 * with a uniqueness rule (see content-row-state.ts), and these are orthogonal
 * to it - a downloaded item may or may not be analysed, and either may or may
 * not have an article. Folding them in would multiply the state set and break
 * the rule that keeps the states distinguishable without colour.
 *
 * So they are drawn as a different kind of thing entirely: small outline
 * glyphs on the meta line, no spine, no chip, no state colour. Icons match the
 * detail view's Analysis and Article tabs, because that is where clicking the
 * row takes you.
 */

/**
 * Whether the analysis actually watched the thing.
 *
 * An analysis from a title and a marketing description is a guess with a
 * confident voice; one from a transcript has read every word. The badge says
 * which by weight, because "analysed" alone would flatten a real difference
 * the user has to know about before trusting a tag.
 */
const isStrongEvidence = (evidence: DfContentBadgeState["analysisEvidence"]) =>
  evidence.includes("transcript") || evidence.includes("article");

export const RowBadges = ({ contentKey }: { contentKey: string }) => {
  const badges = useSelector(selectContentBadges(contentKey));

  if (!badges || (!badges.analysed && !badges.hasArticle)) {
    return null;
  }

  const strong = isStrongEvidence(badges.analysisEvidence);
  const readLabels = badges.analysisEvidence.map((source) => AiEvidenceSourceLabels[source]);
  const analysisTitle = readLabels.length
    ? `Analysed from ${readLabels.join(", ").toLowerCase()}`
    : "Analysed";

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexShrink: 0 }}>
      {badges.analysed && (
        <Tooltip title={strong ? analysisTitle : `${analysisTitle} only - no transcript`}>
          <AutoAwesomeIcon
            sx={{
              fontSize: "0.875rem",
              // The weak case is still shown, just quietly: it is a weaker
              // claim, and the row should read that way before the tooltip.
              color: strong ? "primary.main" : "text.disabled",
            }}
          />
        </Tooltip>
      )}
      {badges.hasArticle && (
        <Tooltip title="Has a Digital Foundry article">
          <ArticleIcon sx={{ fontSize: "0.875rem", color: "text.secondary" }} />
        </Tooltip>
      )}
    </Stack>
  );
};
