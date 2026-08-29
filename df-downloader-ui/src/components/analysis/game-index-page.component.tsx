import ArticleIcon from "@mui/icons-material/Article";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { AiContentTypeLabels, GameGroup, GameIndexResponse, normaliseName } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchGameIndex } from "../../api/ai-analysis.ts";
import { formatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";

/**
 * Everything Digital Foundry covered, grouped by game.
 *
 * A join rather than an aggregate: it collects what DF said about each
 * game and quotes their own verdict. Nothing here averages or ranks
 * anything, deliberately - see docs/AI_CONTENT_ANALYSIS_PLAN.md for why a
 * "which platform wins" tally does not hold up against this data.
 */

/**
 * States plainly what this page is drawn from.
 *
 * Not a footnote or a tooltip. Only analysed content appears here and the
 * user chooses what gets analysed, so this is never a picture of the
 * library - and a page that let someone forget that would be misleading by
 * construction, not merely incomplete.
 */
const CoverageNote = ({ data }: { data: GameIndexResponse }) => (
  <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
    Drawn from {data.analysedCount} analysed{" "}
    {data.analysedCount === 1 ? "item" : "items"} of {data.libraryCount.toLocaleString()} in your library
    {data.ungroupedCount > 0 && (
      <>
        {" "}
        · {data.ungroupedCount} carried no game name (discussions and hands-on previews do not)
      </>
    )}
    . This is not a view of everything Digital Foundry have covered.
  </Alert>
);

const GroupRow = ({ group }: { group: GameGroup }) => {
  const platforms = [...new Set(group.items.flatMap((item) => item.platforms))];
  return (
    <Accordion disableGutters variant="outlined" defaultExpanded={group.items.length > 1}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ width: "100%" }}>
          <Typography sx={{ fontWeight: 600 }}>{group.name}</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={`${group.items.length} ${group.items.length === 1 ? "video" : "videos"}`}
            sx={{ height: 20, fontSize: "0.7rem" }}
          />
          {platforms.slice(0, 4).map((platform) => (
            <Chip
              key={platform}
              size="small"
              variant="outlined"
              label={platform}
              sx={{ height: 20, fontSize: "0.7rem", color: "text.disabled" }}
            />
          ))}
          {/* More than one spelling reached this group, so say so rather
              than presenting a tidy heading as if the data were tidy. */}
          {group.variants.length > 1 && (
            <Tooltip title={`Grouped from: ${group.variants.join(" · ")}`}>
              <Chip
                size="small"
                variant="outlined"
                label={`${group.variants.length} spellings`}
                sx={{ height: 20, fontSize: "0.7rem", color: "warning.main", borderColor: "warning.main" }}
              />
            </Tooltip>
          )}
          {group.mergedByAlias && (
            <Tooltip title="These names were joined by an explicit alias rather than by normalising punctuation and case.">
              <Chip
                size="small"
                variant="outlined"
                label="alias"
                sx={{ height: 20, fontSize: "0.7rem", color: "warning.main", borderColor: "warning.main" }}
              />
            </Tooltip>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        <Stack divider={<Divider />}>
          {group.items.map((item) => (
            <Box key={item.contentKey} sx={{ py: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 500, flex: "1 1 260px" }}>
                  {item.title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", fontFamily: monoFontFamily, whiteSpace: "nowrap" }}
                >
                  {formatDate(item.publishedDate)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={AiContentTypeLabels[item.contentType]}
                  sx={{ height: 20, fontSize: "0.7rem" }}
                />
                {item.engine && (
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {item.engine}
                  </Typography>
                )}
                {/* What the analysis rested on. A verdict drawn from a
                    written article is a stronger claim than one pieced out
                    of machine-transcribed speech, and that difference has
                    to travel with the row. */}
                {item.hasArticle && (
                  <Tooltip title="Grounded in Digital Foundry's written article">
                    <ArticleIcon fontSize="small" sx={{ color: "text.disabled" }} />
                  </Tooltip>
                )}
                {item.usedTranscript && (
                  <Tooltip title="Analysed from the video's transcript">
                    <SubtitlesIcon fontSize="small" sx={{ color: "text.disabled" }} />
                  </Tooltip>
                )}
              </Stack>
              {item.conclusion && (
                // Quoted, and attributed to DF. This is their judgement,
                // not one computed from their numbers.
                <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.75, fontStyle: "italic" }}>
                  “{item.conclusion}”
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
};

export const GameIndexPage = () => {
  const [data, setData] = useState<GameIndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchGameIndex()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = normaliseName(search);
    if (!needle) return data.groups;
    return data.groups.filter(
      (group) =>
        normaliseName(group.name).includes(needle) ||
        group.items.some((item) => normaliseName(item.title).includes(needle))
    );
  }, [data, search]);

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 3 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Building the game index…
        </Typography>
      </Stack>
    );
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" variant="outlined">
          Could not load the game index.
        </Alert>
      </Box>
    );
  }

  return (
    <Stack sx={{ p: 3, gap: 2, height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Games
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          What Digital Foundry covered, grouped by game, drawn from your analysed content.
        </Typography>
      </Box>

      <CoverageNote data={data} />

      {data.groups.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Nothing to group yet. Games appear here once content has been analysed and the analysis produced a game
            name - which happens for console comparisons and PC reviews, not for discussions or hands-on previews.
          </Typography>
        </Paper>
      ) : (
        <>
          <TextField
            size="small"
            label="Search games"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ maxWidth: 360 }}
          />
          <Box sx={{ overflowY: "auto", minHeight: 0, pr: 0.5 }}>
            <Stack spacing={1}>
              {filtered.map((group) => (
                <GroupRow key={group.key} group={group} />
              ))}
              {filtered.length === 0 && (
                <Typography variant="body2" sx={{ color: "text.disabled" }}>
                  No games match “{search}”.
                </Typography>
              )}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
};
