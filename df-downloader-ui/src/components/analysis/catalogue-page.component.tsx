import ArticleIcon from "@mui/icons-material/Article";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import { Alert, Box, Chip, CircularProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { AiContentType, AiContentTypeLabels, AnalysisCatalogueEntry } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchAnalysisCatalogue } from "../../api/ai-analysis.ts";
import { conciseFormatDate } from "../../utils/date.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { ANALYSIS_CARD_GAP } from "./analysis-card.component.tsx";
import { useAnalysisDrilldown } from "./use-analysis-drilldown.tsx";

/**
 * Everything analysed, in one filterable list.
 *
 * The other pages in this section are slices - one game, one kind of payload -
 * and none of them answers "what did it decide this was", which is the most
 * consequential thing the analysis produces: content type picks the schema, so
 * a wrong one silently costs a whole table.
 *
 * Deliberately here rather than as a filter on the Content list. Only a
 * fraction of the library is analysed, so a content-type filter there would
 * hide almost everything with no obvious reason; arriving at Analysis already
 * says the scope is analysed content, and the header states the share anyway.
 */
export const CataloguePage = () => {
  const [data, setData] = useState<{ entries: AnalysisCatalogueEntry[]; libraryCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [types, setTypes] = useState<AiContentType[]>([]);
  const { openAnalysis, dialogs } = useAnalysisDrilldown("catalogue");

  useEffect(() => {
    fetchAnalysisCatalogue()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // Counts come from the whole set, never from the filtered view: a chip that
  // renumbered as you filtered would stop telling you how much there is.
  const counts = useMemo(() => {
    const out = new Map<AiContentType, number>();
    for (const entry of data?.entries ?? []) {
      out.set(entry.contentType, (out.get(entry.contentType) ?? 0) + 1);
    }
    return out;
  }, [data]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.entries ?? []).filter((entry) => {
      if (types.length && !types.includes(entry.contentType)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        entry.title.toLowerCase().includes(needle) || (entry.primaryGame ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, search, types]);

  if (error) {
    return <Alert severity="error">Could not load the catalogue: {error}</Alert>;
  }
  if (!data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const toggle = (type: AiContentType) =>
    setTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));

  return (
    <Stack spacing={ANALYSIS_CARD_GAP}>
      <Box>
        <Typography variant="h6">Catalogue</Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Everything analysed, by what it was judged to be · {data.entries.length} of {data.libraryCount} in the
          library
        </Typography>
      </Box>

      <TextField
        size="small"
        placeholder="Search by title or game"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ maxWidth: 420 }}
      />

      {/* Ordered by how much there is, so the types that actually populate the
          library lead - the taxonomy's own order means nothing to a reader. */}
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => (
            <Chip
              key={type}
              size="small"
              label={`${AiContentTypeLabels[type]} ${count}`}
              variant={types.includes(type) ? "filled" : "outlined"}
              color={types.includes(type) ? "primary" : "default"}
              onClick={() => toggle(type)}
            />
          ))}
        {types.length > 0 && <Chip size="small" label="Clear" onClick={() => setTypes([])} />}
      </Stack>

      {shown.length === 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Nothing matches.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {shown.map((entry) => (
            <Box
              key={entry.contentKey}
              component="button"
              onClick={() => openAnalysis(entry.contentKey, entry.title)}
              sx={{
                textAlign: "left",
                width: "100%",
                font: "inherit",
                color: "inherit",
                cursor: "pointer",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                backgroundColor: "transparent",
                px: 1.25,
                py: 0.9,
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                alignItems="baseline"
                justifyContent="space-between"
                sx={{ flexWrap: "wrap" }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2">{entry.title}</Typography>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25, flexWrap: "wrap" }}>
                    <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: monoFontFamily }}>
                      {conciseFormatDate(entry.publishedDate)}
                    </Typography>
                    {entry.primaryGame && (
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>
                        {entry.primaryGame}
                      </Typography>
                    )}
                    {entry.evidence.includes("article") && (
                      <Tooltip title="Grounded in Digital Foundry's written article">
                        <ArticleIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                      </Tooltip>
                    )}
                    {entry.evidence.includes("transcript") && (
                      <Tooltip title="Analysed from the video's transcript">
                        <SubtitlesIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                      </Tooltip>
                    )}
                    {/* Says so explicitly rather than looking like an ordinary
                        row: a type with no payload is the case worth spotting. */}
                    {!entry.hasStructuredData && !entry.hasError && (
                      <Tooltip title="Classified and summarised, but this type extracts no table">
                        <Typography variant="caption" sx={{ color: "text.disabled", fontStyle: "italic" }}>
                          summary only
                        </Typography>
                      </Tooltip>
                    )}
                    {entry.hasError && <Chip size="small" color="warning" variant="outlined" label="failed" />}
                  </Stack>
                </Box>
                <Chip size="small" variant="outlined" label={AiContentTypeLabels[entry.contentType]} />
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
      {dialogs}
    </Stack>
  );
};
