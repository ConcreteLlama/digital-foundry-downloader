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
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { AnalysisDialog } from "./analysis-dialog.component.tsx";
import { conciseFormatDate } from "../../utils/date.ts";
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
  <Alert
    severity="info"
    variant="outlined"
    sx={{ py: 0.25, "& .MuiAlert-message": { py: 0.5 }, "& .MuiAlert-icon": { py: 0.75 } }}
  >
    <Typography variant="caption" sx={{ color: "text.secondary" }}>
      {data.analysedCount} of {data.libraryCount.toLocaleString()} analysed
      {data.ungroupedCount > 0 && ` · ${data.ungroupedCount} without a game name`} · not a view of your whole library
    </Typography>
  </Alert>
);

const GroupRow = ({ group, onOpen }: { group: GameGroup; onOpen: (contentKey: string) => void }) => {
  const allPlatforms = [...new Set(group.items.flatMap((item) => item.platforms))];
  // Capped rather than wrapped: the full set pushed the header onto three
  // lines on a phone, which made a list of games unscannable.
  const platforms = allPlatforms.slice(0, 3);
  const extraPlatforms = allPlatforms.length - platforms.length;
  return (
    <Accordion disableGutters variant="outlined" defaultExpanded={group.items.length > 1}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ width: "100%" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {group.name}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={group.items.length === 1 ? "1 video" : `${group.items.length} videos`}
            sx={{ height: 18, fontSize: "0.65rem" }}
          />
          {platforms.map((platform) => (
            <Chip
              key={platform}
              size="small"
              variant="outlined"
              label={platform}
              sx={{ height: 18, fontSize: "0.65rem", color: "text.disabled" }}
            />
          ))}
          {extraPlatforms > 0 && (
            <Tooltip title={allPlatforms.join(" · ")}>
              <Chip
                size="small"
                variant="outlined"
                label={`+${extraPlatforms}`}
                sx={{ height: 18, fontSize: "0.65rem", color: "text.disabled" }}
              />
            </Tooltip>
          )}
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
            <Box
              key={item.contentKey}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(item.contentKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpen(item.contentKey);
                }
              }}
              // This view is an index into the per-item analysis, not a
              // replacement for it - every row leads to the full panel
              // rather than restating a trimmed version of it here.
              sx={{
                py: 1,
                px: 1,
                mx: -1,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
              }}
            >
              <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                <Typography variant="body2" sx={{ fontWeight: 500, flex: "1 1 260px" }}>
                  {item.title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", fontFamily: monoFontFamily, whiteSpace: "nowrap" }}
                >
                  {conciseFormatDate(item.publishedDate)}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                <Chip
                  size="small"
                  variant="outlined"
                  color="primary"
                  label={AiContentTypeLabels[item.contentType]}
                  sx={{ height: 18, fontSize: "0.65rem" }}
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
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    mt: 0.5,
                    fontStyle: "italic",
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
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
  const [analysisKey, setAnalysisKey] = useState<string | null>(null);
  const [contentKey, setContentKey] = useState<string | null>(null);

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
    <Stack sx={{ gap: 1.5, height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Games
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          What Digital Foundry covered, grouped by game.
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
                <GroupRow key={group.key} group={group} onOpen={setAnalysisKey} />
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

      <AnalysisDialog
        contentKey={analysisKey}
        title={data.groups.flatMap((group) => group.items).find((item) => item.contentKey === analysisKey)?.title}
        onClose={() => setAnalysisKey(null)}
        onOpenContent={(key) => {
          setAnalysisKey(null);
          setContentKey(key);
        }}
      />

      <MiddleModal
        open={Boolean(contentKey)}
        onClose={() => setContentKey(null)}
        id="game-index-content-modal"
        hideCloseButton
      >
        <Box>
          <DfContentInfoItemDetail dfContentName={contentKey || ""} onClose={() => setContentKey(null)} />
        </Box>
      </MiddleModal>
    </Stack>
  );
};
