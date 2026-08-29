import ArticleIcon from "@mui/icons-material/Article";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { PlatformComparisonResponse, PlatformComparisonRow, PlatformMode, normaliseName } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchPlatformComparison } from "../../api/ai-analysis.ts";
import { monoFontFamily } from "../../themes/build-theme.ts";
import { conciseFormatDate } from "../../utils/date.ts";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";
import { AnalysisDialog } from "./analysis-dialog.component.tsx";

/**
 * Every console comparison, side by side.
 *
 * A ledger of Digital Foundry's own figures, not a scoreboard. There is no
 * ranking and no "winner" column, and that is a conclusion from the data
 * rather than caution - see the model in df-downloader-common for the
 * measured reason.
 */

const NotStated = () => (
  <Box component="span" sx={{ color: "text.disabled", fontStyle: "italic", fontSize: "0.7rem" }}>
    not stated
  </Box>
);

/**
 * One platform's modes, as the video described them.
 *
 * Not aligned with the neighbouring cells: mode labels are free text with
 * no shared vocabulary across videos, so matching them up would be a guess
 * the reader could not see through. They are listed as given instead.
 */
const PlatformCell = ({ modes }: { modes: PlatformMode[] | undefined }) => {
  if (!modes?.length) {
    return (
      <Box sx={{ color: "text.disabled", fontSize: "0.75rem" }}>—</Box>
    );
  }
  return (
    <Stack spacing={0.75}>
      {modes.map((mode, index) => (
        <Box key={`${mode.label}-${index}`}>
          <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {mode.label}
            </Typography>
            {mode.fpsTarget != null ? (
              <Typography
                variant="caption"
                sx={{ color: "primary.main", fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" }}
              >
                {mode.fpsTarget}fps
              </Typography>
            ) : (
              <NotStated />
            )}
          </Stack>
          {mode.resolution ? (
            <Typography
              variant="caption"
              sx={{ display: "block", color: "text.secondary", fontFamily: monoFontFamily }}
            >
              {mode.resolution}
            </Typography>
          ) : (
            <Box sx={{ mt: 0.25 }}>
              <NotStated />
            </Box>
          )}
          {/* Shown only when present - it is absent from roughly nine in ten
              real modes, so a permanent placeholder row would be mostly
              noise. */}
          {mode.fpsMeasuredAvg != null && (
            <Tooltip title="What Digital Foundry measured it actually running at, as opposed to the frame rate the mode aims for">
              <Typography variant="caption" sx={{ display: "block", color: "text.disabled" }}>
                actually ran at{" "}
                <Box component="span" sx={{ fontFamily: monoFontFamily }}>
                  {mode.fpsMeasuredAvg}fps
                </Box>
              </Typography>
            </Tooltip>
          )}
        </Box>
      ))}
    </Stack>
  );
};

/**
 * How complete the table actually is, stated up front.
 *
 * A reader looking at a table full of "not stated" deserves to know that
 * this is the normal condition of the source material and not a fault -
 * and that the one field a scoreboard would need is the one that is almost
 * never there.
 */
const CoverageNote = ({ data }: { data: PlatformComparisonResponse }) => {
  const { coverage } = data;
  return (
    <Alert
      severity="info"
      variant="outlined"
      icon={<WarningAmberIcon fontSize="small" />}
      sx={{ py: 0.25, "& .MuiAlert-message": { py: 0.5 }, "& .MuiAlert-icon": { py: 0.75 } }}
    >
      {/* Both frame-rate figures are defined where they are used. "Target"
          and "measured average" are the schema's words, not words a reader
          arrives already knowing, and the difference between them is the
          whole reason this table has no best-platform column. */}
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
        {data.comparisonCount} comparisons covering {coverage.totalModes} platform modes. A blank cell means Digital
        Foundry did not give that figure — not that something is missing here.
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25 }}>
        They gave the resolution for <strong>{coverage.withResolution}</strong> modes, and the frame rate the mode aims
        for in <strong>{coverage.withFpsTarget}</strong> — but only{" "}
        <Box component="strong" sx={{ color: "warning.main" }}>
          {coverage.withMeasuredAvg}
        </Box>{" "}
        say what it <em>actually</em> ran at when they tested it.
      </Typography>
      <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.25 }}>
        That last figure is the only one that could rank platforms, and it is missing most often when they performed
        about the same — so there is no "best platform" column.
      </Typography>
    </Alert>
  );
};

const ComparisonRow = ({
  row,
  platforms,
  onOpen,
}: {
  row: PlatformComparisonRow;
  platforms: string[];
  onOpen: (contentKey: string) => void;
}) => (
  <TableRow
    hover
    onClick={() => onOpen(row.contentKey)}
    sx={{ cursor: "pointer", verticalAlign: "top" }}
  >
    <TableCell sx={{ minWidth: 220 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {row.game || row.title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
        {conciseFormatDate(row.publishedDate)}
        {row.developer ? ` · ${row.developer}` : ""}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
        {row.hasArticle && (
          <Tooltip title="Grounded in Digital Foundry's written article">
            <ArticleIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          </Tooltip>
        )}
        {row.usedTranscript && (
          <Tooltip title="Analysed from the video's transcript">
            <SubtitlesIcon sx={{ fontSize: 14, color: "text.disabled" }} />
          </Tooltip>
        )}
      </Stack>
      {row.unrecognised.length > 0 && (
        // Named rather than counted. These are mostly real platforms that
        // simply have no column - PS4, iPhone, Mac - so a bare
        // "1 unrecognised" both alarmed and told the reader nothing. A
        // genuine mis-extraction reads correctly here too.
        <Tooltip title={row.unrecognised.map((entry) => entry.platform).join(" · ")}>
          <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "text.disabled" }}>
            Also: {row.unrecognised.slice(0, 2).map((entry) => entry.platform).join(", ")}
            {row.unrecognised.length > 2 ? ` +${row.unrecognised.length - 2}` : ""}
          </Typography>
        </Tooltip>
      )}
    </TableCell>
    {platforms.map((platform) => (
      <TableCell key={platform} sx={{ minWidth: 150 }}>
        <PlatformCell modes={row.platforms[platform]} />
      </TableCell>
    ))}
    <TableCell sx={{ minWidth: 240 }}>
      {row.recommendation ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontStyle: "italic",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          “{row.recommendation}”
        </Typography>
      ) : (
        <NotStated />
      )}
      {row.knownIssues.length > 0 && (
        <Tooltip title="Open the analysis to read these">
          <Chip
            size="small"
            variant="outlined"
            clickable
            onClick={(event) => {
              event.stopPropagation();
              onOpen(row.contentKey);
            }}
            label={`${row.knownIssues.length} known ${row.knownIssues.length === 1 ? "issue" : "issues"}`}
            sx={{ mt: 0.75, height: 18, fontSize: "0.65rem", color: "error.main", borderColor: "error.main" }}
          />
        </Tooltip>
      )}
    </TableCell>
  </TableRow>
);

export const PlatformComparisonPage = () => {
  const [data, setData] = useState<PlatformComparisonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [analysisKey, setAnalysisKey] = useState<string | null>(null);
  const [contentKey, setContentKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformComparison()
      .then((result) => !cancelled && setData(result))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Columns follow the filter: picking two platforms is asking to compare
   * those two, and leaving the other six columns on screen would defeat
   * the point of narrowing.
   */
  const columns = selectedPlatforms.length ? selectedPlatforms : (data?.platformsPresent ?? []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = normaliseName(search);
    return data.rows.filter((row) => {
      if (needle && !normaliseName(row.game ?? "").includes(needle) && !normaliseName(row.title).includes(needle)) {
        return false;
      }
      // Every selected platform, not any of them: selecting PS5 and Series
      // X means "where were these two compared against each other", and a
      // row covering only one of them does not answer that. With a single
      // platform selected the two readings coincide anyway.
      return selectedPlatforms.every((platform) => row.platforms[platform]?.length);
    });
  }, [data, search, selectedPlatforms]);

  const togglePlatform = (platform: string) =>
    setSelectedPlatforms((current) =>
      current.includes(platform) ? current.filter((p) => p !== platform) : [...current, platform]
    );

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 3 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Building the comparison table…
        </Typography>
      </Stack>
    );
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" variant="outlined">
          Could not load the comparison table.
        </Alert>
      </Box>
    );
  }

  return (
    <Stack sx={{ gap: 1.5, height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Platform comparisons
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Digital Foundry's own figures, side by side. Nothing here is averaged or ranked.
        </Typography>
      </Box>

      <CoverageNote data={data} />

      {data.rows.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No console comparisons analysed yet. Analyse a face-off or tech review and it will appear here.
          </Typography>
        </Paper>
      ) : (
        <>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <TextField
              size="small"
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ maxWidth: 280, flex: "1 1 200px" }}
            />
          </Stack>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              Platforms:
            </Typography>
            {data.platformsPresent.map((platform) => {
              const selected = selectedPlatforms.includes(platform);
              return (
                <Chip
                  key={platform}
                  size="small"
                  clickable
                  variant={selected ? "filled" : "outlined"}
                  color={selected ? "primary" : "default"}
                  label={platform}
                  onClick={() => togglePlatform(platform)}
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              );
            })}
            {selectedPlatforms.length > 0 && (
              <Chip
                size="small"
                variant="outlined"
                clickable
                label="Clear"
                onClick={() => setSelectedPlatforms([])}
                sx={{ height: 22, fontSize: "0.7rem", color: "text.disabled" }}
              />
            )}
          </Stack>
          {selectedPlatforms.length > 0 && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {rows.length} of {data.rows.length} comparisons cover{" "}
              {selectedPlatforms.length === 1 ? selectedPlatforms[0] : `all of ${selectedPlatforms.join(", ")}`}.
            </Typography>
          )}
          {/* The table scrolls inside its own container - with a column per
              platform it is wider than the page, and the page itself must
              never scroll sideways. */}
          <TableContainer component={Paper} variant="outlined" sx={{ overflow: "auto", minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Game</TableCell>
                  {columns.map((platform) => (
                    <TableCell key={platform}>{platform}</TableCell>
                  ))}
                  <TableCell>DF's recommendation</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <ComparisonRow
                    key={row.contentKey}
                    row={row}
                    platforms={columns}
                    onOpen={setAnalysisKey}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {rows.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              {selectedPlatforms.length > 1
                ? `No analysed comparison covers all of ${selectedPlatforms.join(", ")} together.`
                : search
                  ? `Nothing matches “${search}”.`
                  : "Nothing to show."}
            </Typography>
          )}
        </>
      )}

      <AnalysisDialog
        contentKey={analysisKey}
        title={data.rows.find((row) => row.contentKey === analysisKey)?.title}
        onClose={() => setAnalysisKey(null)}
        onOpenContent={(key) => {
          setAnalysisKey(null);
          setContentKey(key);
        }}
      />

      <MiddleModal
        open={Boolean(contentKey)}
        onClose={() => setContentKey(null)}
        id="platform-comparison-content-modal"
        hideCloseButton
      >
        <Box>
          <DfContentInfoItemDetail dfContentName={contentKey || ""} onClose={() => setContentKey(null)} />
        </Box>
      </MiddleModal>
    </Stack>
  );
};
