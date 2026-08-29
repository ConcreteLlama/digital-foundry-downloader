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
import { formatDate } from "../../utils/date.ts";
import { MiddleModal } from "../general/middle-modal.component.tsx";
import { DfContentInfoItemDetail } from "../df-content/df-content-item-detail/df-content-item-detail.component.tsx";

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
            <Typography variant="caption" sx={{ display: "block", color: "text.disabled" }}>
              measured avg{" "}
              <Box component="span" sx={{ fontFamily: monoFontFamily }}>
                {mode.fpsMeasuredAvg}
              </Box>
            </Typography>
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
  const pct = (n: number) => (coverage.totalModes ? Math.round((n / coverage.totalModes) * 100) : 0);
  return (
    <Alert severity="info" variant="outlined" icon={<WarningAmberIcon fontSize="small" />}>
      {data.comparisonCount} console {data.comparisonCount === 1 ? "comparison" : "comparisons"} from{" "}
      {data.analysedCount} analysed items ({data.libraryCount.toLocaleString()} in your library). Across{" "}
      {coverage.totalModes} modes, Digital Foundry stated a resolution for {pct(coverage.withResolution)}%, a target
      frame rate for {pct(coverage.withFpsTarget)}%, and a measured average for only{" "}
      <strong>{pct(coverage.withMeasuredAvg)}%</strong>. There is no ranking column because that last figure is the one
      it would need, and it is usually absent — and absent more often where platforms performed similarly.
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
        {formatDate(row.publishedDate)}
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
        // Surfaced, not hidden. Some of these are platforms the canonical
        // list has not caught up with; at least one in the real corpus is
        // a section heading the extraction mistook for a platform. Both
        // are worth seeing.
        <Tooltip title={row.unrecognised.map((entry) => entry.platform).join(" · ")}>
          <Chip
            size="small"
            variant="outlined"
            label={`${row.unrecognised.length} unrecognised`}
            sx={{ mt: 0.5, height: 18, fontSize: "0.65rem", color: "warning.main", borderColor: "warning.main" }}
          />
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
        <Typography variant="caption" sx={{ color: "text.secondary", fontStyle: "italic" }}>
          “{row.recommendation}”
        </Typography>
      ) : (
        <NotStated />
      )}
      {row.knownIssues.length > 0 && (
        <Tooltip title={row.knownIssues.join(" · ")}>
          <Chip
            size="small"
            variant="outlined"
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
  const [openContentKey, setOpenContentKey] = useState<string | null>(null);

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

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = normaliseName(search);
    if (!needle) return data.rows;
    return data.rows.filter(
      (row) => normaliseName(row.game ?? "").includes(needle) || normaliseName(row.title).includes(needle)
    );
  }, [data, search]);

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
    <Stack sx={{ p: 3, gap: 2, height: "100%", minHeight: 0 }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Platform comparisons
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Every analysed console comparison, side by side. Digital Foundry's own figures — nothing here is averaged or
          ranked.
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
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ maxWidth: 360 }}
          />
          {/* The table scrolls inside its own container - with a column per
              platform it is wider than the page, and the page itself must
              never scroll sideways. */}
          <TableContainer component={Paper} variant="outlined" sx={{ overflow: "auto", minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Game</TableCell>
                  {data.platformsPresent.map((platform) => (
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
                    platforms={data.platformsPresent}
                    onOpen={setOpenContentKey}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {rows.length === 0 && (
            <Typography variant="body2" sx={{ color: "text.disabled" }}>
              Nothing matches “{search}”.
            </Typography>
          )}
        </>
      )}

      <MiddleModal
        open={Boolean(openContentKey)}
        onClose={() => setOpenContentKey(null)}
        id="platform-comparison-detail-modal"
        hideCloseButton
      >
        <Box>
          <DfContentInfoItemDetail dfContentName={openContentKey || ""} onClose={() => setOpenContentKey(null)} />
        </Box>
      </MiddleModal>
    </Stack>
  );
};
