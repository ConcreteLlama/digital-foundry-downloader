import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Box,
  Chip,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  AiHardwareReviewData,
  AiPcReviewSettingsData,
  AiPlatformTechReviewData,
  AiPlatformEntry,
  AiPreviewData,
  AiQaSegment,
  AiStructuredData,
  secondsToHHMMSS,
} from "df-downloader-common";
import { monoFontFamily } from "../../../themes/build-theme.ts";

/**
 * Renders the "the video didn't say" case.
 *
 * Deliberately a phrase rather than a dash or a blank. The extraction is
 * instructed to return null instead of estimating, which is the single
 * property that makes these numbers worth trusting - and rendering that
 * null as "-" or "0" throws it away, because the reader can no longer tell
 * "not measured" from "measured at zero".
 */
const NotStated = () => (
  <Typography component="span" variant="caption" sx={{ color: "text.disabled", fontStyle: "italic" }}>
    not stated
  </Typography>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Typography
    variant="caption"
    sx={{ color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}
  >
    {children}
  </Typography>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <Box component="span" sx={{ fontFamily: monoFontFamily, fontVariantNumeric: "tabular-nums" }}>
    {children}
  </Box>
);

/**
 * A headline figure. The optimised-settings result is the number someone
 * opens a PC review for, so it leads rather than sitting at the foot of
 * the settings table.
 */
const Stat = ({ label, value, delta }: { label: string; value: React.ReactNode; delta?: string }) => (
  <Paper variant="outlined" sx={{ p: 1.5, flex: "1 1 150px", bgcolor: "background.default" }}>
    <SectionLabel>{label}</SectionLabel>
    <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.5 }}>
      <Typography sx={{ fontFamily: monoFontFamily, fontSize: "1.25rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
      {delta && (
        <Typography variant="body2" sx={{ color: "success.main", fontWeight: 500 }}>
          {delta}
        </Typography>
      )}
    </Stack>
  </Paper>
);

const PcReviewSettings = ({ data, onJumpTo }: { data: AiPcReviewSettingsData; onJumpTo?: (seconds: number) => void }) => {
  const optimised = data.optimisedSettingsResult;
  const hasOptimised = optimised && (optimised.fpsBefore != null || optimised.fpsAfter != null);
  return (
    <Stack spacing={2}>
      {(hasOptimised || data.bottleneck || data.engine) && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {hasOptimised && (
            <Stat
              label="Optimised result"
              value={`${optimised!.fpsBefore ?? "?"} → ${optimised!.fpsAfter ?? "?"}`}
              delta={optimised!.gainPct != null ? `+${optimised!.gainPct}%` : undefined}
            />
          )}
          {data.bottleneck?.type && (
            <Paper variant="outlined" sx={{ p: 1.5, flex: "1 1 150px", bgcolor: "background.default" }}>
              <SectionLabel>Bottleneck</SectionLabel>
              <Typography sx={{ mt: 0.5, fontWeight: 600, color: "warning.main" }}>{data.bottleneck.type}</Typography>
              {data.bottleneck.detail && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.5 }}>
                  {data.bottleneck.detail}
                </Typography>
              )}
            </Paper>
          )}
          {data.engine && (
            <Paper variant="outlined" sx={{ p: 1.5, flex: "1 1 150px", bgcolor: "background.default" }}>
              <SectionLabel>Engine</SectionLabel>
              <Typography sx={{ mt: 0.5, fontWeight: 500 }}>{data.engine}</Typography>
            </Paper>
          )}
        </Stack>
      )}

      {optimised?.testSystem && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Tested on {optimised.testSystem}
        </Typography>
      )}

      {data.settings.length > 0 && (
        <Box>
          <SectionLabel>Settings</SectionLabel>
          {/* Scrolls within its own container - the detail panel is narrow and
              the page body must never scroll sideways. */}
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 1, overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 520 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Setting</TableCell>
                  <TableCell>Recommended</TableCell>
                  <TableCell align="right">Cost</TableCell>
                  <TableCell>Console equivalent</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.settings.map((setting) => (
                  <TableRow key={setting.name}>
                    <TableCell sx={{ fontWeight: 500 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                        <span>{setting.name}</span>
                        <JumpChip seconds={setting.timestampSeconds} quoteSource={setting.quoteSource} onJumpTo={onJumpTo} />
                      </Stack>
                      {setting.levelsTested.length > 0 && (
                        <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
                          {setting.levelsTested.join(" · ")}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{setting.recommendation || <NotStated />}</TableCell>
                    <TableCell align="right">
                      {setting.perfDeltaPct != null ? <Mono>{setting.perfDeltaPct}%</Mono> : <NotStated />}
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary" }}>{setting.consoleEquivalent || <NotStated />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Stack>
  );
};

/**
 * Platforms as peers rather than rows of one wide table - a face-off is
 * read by comparing across platforms, and a table of every platform-mode
 * combination forces horizontal scrolling in a narrow dialog.
 */
/**
 * The per-platform mode table.
 *
 * Shared because a platform analysis is structurally a face-off with fewer
 * platforms - same modes, same numbers - so rendering it differently would
 * be a difference with no meaning behind it.
 */
const PlatformGrid = ({
  platforms,
  onJumpTo,
}: {
  platforms: AiPlatformEntry[];
  onJumpTo?: (seconds: number) => void;
}) => (
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {platforms.map((platform) => (
        <Paper key={platform.platform} variant="outlined" sx={{ overflow: "hidden" }}>
          <Typography
            sx={{ px: 1.5, py: 1, fontWeight: 600, fontSize: "0.8125rem", bgcolor: "background.default" }}
          >
            {platform.platform}
          </Typography>
          <Divider />
          {platform.modes.map((mode, index) => (
            <Box key={`${mode.label}-${index}`} sx={{ px: 1.5, py: 1, borderTop: index ? 1 : 0, borderColor: "divider" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {mode.label}
                  </Typography>
                  <JumpChip seconds={mode.timestampSeconds} quoteSource={mode.quoteSource} onJumpTo={onJumpTo} />
                </Stack>
                {mode.fpsTarget != null && (
                  <Typography variant="body2" sx={{ color: "primary.main", fontFamily: monoFontFamily }}>
                    {mode.fpsTarget} fps
                  </Typography>
                )}
              </Stack>
              {mode.resolution && (
                <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: monoFontFamily, display: "block" }}>
                  {mode.resolution}
                </Typography>
              )}
              {mode.fpsMeasuredAvg != null && (
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  Measured average <Mono>{mode.fpsMeasuredAvg}</Mono>
                </Typography>
              )}
              {mode.notes && (
                <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 0.25 }}>
                  {mode.notes}
                </Typography>
              )}
            </Box>
          ))}
        </Paper>
      ))}
    </Box>
);

const KnownIssues = ({
  issues,
  onJumpTo,
}: {
  issues: AiPlatformTechReviewData["knownIssues"];
  onJumpTo?: (seconds: number) => void;
}) =>
  issues.length ? (
    <Box>
      <SectionLabel>Known issues</SectionLabel>
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: "text.secondary" }}>
        {issues.map((known, index) => (
          <Typography component="li" variant="body2" key={index}>
            {known.issue}
            {(known.timestampSeconds != null || known.quoteSource === "article") && (
              <Box component="span" sx={{ ml: 0.75, verticalAlign: "middle" }}>
                <JumpChip seconds={known.timestampSeconds} quoteSource={known.quoteSource} onJumpTo={onJumpTo} />
              </Box>
            )}
          </Typography>
        ))}
      </Box>
    </Box>
  ) : null;


/**
 * Per-segment, because a roundtable holds several independent and
 * sometimes contradicting views that one summary would flatten. A topic
 * the participants left unresolved says so rather than being given a
 * verdict it never reached.
 */

/**
 * Jump the video to where a finding was said.
 *
 * Rendered only when the finding actually carries a resolved timestamp, and
 * only when there is a player to drive - never as a disabled control. A
 * finding whose quote could not be located has no anchor, and the honest
 * presentation of that is nothing at all rather than a button that goes
 * somewhere approximate.
 */
/**
 * The moment a finding was stated, or an honest account of why there isn't one.
 *
 * A finding with no timestamp used to render as blank space, which made a
 * correct citation of Digital Foundry's written article look identical to a
 * fabrication. Measured over the stored corpus, 18% of quoted findings are
 * article-sourced against 13% found in neither source - so blank space was
 * misrepresenting good citations more often than it was hiding bad ones.
 *
 * Deliberately not clickable: an article is written rather than spoken, so
 * there is genuinely nowhere in the video to jump to.
 */
const JumpChip = ({
  seconds,
  quoteSource,
  onJumpTo,
}: {
  seconds?: number | null;
  quoteSource?: "transcript" | "article" | null;
  onJumpTo?: (seconds: number) => void;
}) => {
  if (seconds == null || !onJumpTo) {
    if (quoteSource === "article") {
      return (
        <Chip
          size="small"
          variant="outlined"
          label="in the article"
          sx={{ height: 20, fontSize: "0.65rem", color: "text.secondary", borderColor: "divider" }}
        />
      );
    }
    return null;
  }
  return (
    <Chip
      size="small"
      variant="outlined"
      clickable
      icon={<PlayArrowIcon sx={{ fontSize: "0.85rem" }} />}
      label={secondsToHHMMSS(Math.floor(seconds))}
      onClick={() => onJumpTo(seconds)}
      sx={{
        height: 20,
        fontFamily: monoFontFamily,
        fontSize: "0.65rem",
        color: "primary.main",
        borderColor: "primary.main",
        "& .MuiChip-icon": { color: "primary.main", ml: 0.4 },
      }}
    />
  );
};

/**
 * A sequence of independent items - a Q+A, a Direct, a year-end list.
 *
 * One renderer for all three because they are the same structure, and each
 * item names the game it concerns where it has one. That chip is the visible
 * half of what makes a Direct findable under the games it covered.
 */
const SegmentList = ({ segments, onJumpTo }: { segments: AiQaSegment[]; onJumpTo?: (seconds: number) => void }) => (
  <Stack spacing={1}>
    {segments.map((segment, index) => (
      <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {segment.topic}
          </Typography>
          {segment.game && (
            <Chip
              size="small"
              variant="outlined"
              label={segment.game}
              sx={{ height: 20, fontSize: "0.65rem" }}
            />
          )}
          <JumpChip seconds={segment.timestampSeconds} quoteSource={segment.quoteSource} onJumpTo={onJumpTo} />
        </Stack>
        {segment.summary && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {segment.summary}
          </Typography>
        )}
        <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: "divider", borderTopStyle: "dashed" }}>
          <SectionLabel>Conclusion</SectionLabel>
          <Typography
            variant="body2"
            sx={{ mt: 0.25, ...(segment.conclusion ? {} : { color: "text.disabled", fontStyle: "italic" }) }}
          >
            {segment.conclusion || "Left open - no conclusion was reached."}
          </Typography>
        </Box>
      </Paper>
    ))}
  </Stack>
);

/**
 * One game examined technically, on however many platforms.
 *
 * A single component where there were two. The face-off and single-platform
 * renderings differed only in whether they offered "What changed" and whether
 * they called the bottom line a verdict or a recommendation - and both
 * sections are conditional, so a face-off with no delta simply omits the
 * first exactly as it did before.
 */
const PlatformTechReview = ({
  data,
  onJumpTo,
}: {
  data: AiPlatformTechReviewData;
  onJumpTo?: (seconds: number) => void;
}) => (
  <Stack spacing={2}>
    {(data.game || data.developer) && (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {data.game}
        {data.developer ? ` · ${data.developer}` : ""}
      </Typography>
    )}
    {/* First, not last: this format is usually about a delta - what a patch
        or port changed - and that is the answer people came for. */}
    {data.changeSummary && (
      <Box>
        <SectionLabel>What changed</SectionLabel>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {data.changeSummary}
        </Typography>
      </Box>
    )}
    <PlatformGrid platforms={data.platforms} onJumpTo={onJumpTo} />
    <KnownIssues issues={data.knownIssues} onJumpTo={onJumpTo} />
    {data.recommendation && (
      <Box>
        <SectionLabel>Recommendation</SectionLabel>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {data.recommendation}
        </Typography>
      </Box>
    )}
  </Stack>
);

/**
 * A preview, deliberately without a numbers table.
 *
 * The format is provisional by design, so this shows what was seen and what
 * the presenters said not to conclude from it - rather than a tidy grid that
 * would imply a precision nobody claimed.
 */
const HandsOnPreview = ({ data, onJumpTo }: { data: AiPreviewData; onJumpTo?: (seconds: number) => void }) => (
  <Stack spacing={2}>
    {(data.game || data.platforms.length > 0 || data.buildState) && (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {data.game && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {data.game}
          </Typography>
        )}
        {data.platforms.map((platform) => (
          <Chip key={platform} size="small" variant="outlined" label={platform} sx={{ height: 20, fontSize: "0.65rem" }} />
        ))}
        {data.buildState && (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            {data.buildState}
          </Typography>
        )}
      </Stack>
    )}
    {data.observations.length > 0 && (
      <Box>
        <SectionLabel>What was shown</SectionLabel>
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: "text.secondary" }}>
          {data.observations.map((item, index) => (
            <Typography component="li" variant="body2" key={index}>
              {item.observation}
              {(item.timestampSeconds != null || item.quoteSource === "article") && (
                <Box component="span" sx={{ ml: 0.75, verticalAlign: "middle" }}>
                  <JumpChip seconds={item.timestampSeconds} quoteSource={item.quoteSource} onJumpTo={onJumpTo} />
                </Box>
              )}
            </Typography>
          ))}
        </Box>
      </Box>
    )}
    {data.caveats && (
      <Box>
        <SectionLabel>Caveats</SectionLabel>
        <Typography variant="body2" sx={{ mt: 0.5, color: "text.secondary" }}>
          {data.caveats}
        </Typography>
      </Box>
    )}
  </Stack>
);

const HardwareReview = ({ data, onJumpTo }: { data: AiHardwareReviewData; onJumpTo?: (seconds: number) => void }) => (
  <Stack spacing={2}>
    {data.products.length > 0 && (
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {data.products.map((product, index) => (
          <Paper key={`${product.name}-${index}`} variant="outlined" sx={{ p: 1.5 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {product.name}
              </Typography>
              {product.productClass && (
                <Typography variant="caption" sx={{ color: "text.disabled" }}>
                  {product.productClass}
                </Typography>
              )}
              <JumpChip seconds={product.timestampSeconds} onJumpTo={onJumpTo} />
            </Stack>
            {product.verdict && (
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
                {product.verdict}
              </Typography>
            )}
          </Paper>
        ))}
      </Box>
    )}
    <KnownIssues issues={data.knownIssues} onJumpTo={onJumpTo} />
    {data.verdict && (
      <Box>
        <SectionLabel>Verdict</SectionLabel>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {data.verdict}
        </Typography>
      </Box>
    )}
    {/* Labelled as tests rather than coverage - these games are instruments
        here, and listing them plainly would read as though the video was
        about them. */}
    {data.gamesTested.length > 0 && (
      <Box>
        <SectionLabel>Tested with</SectionLabel>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
          {data.gamesTested.map((game) => (
            <Chip key={game} size="small" variant="outlined" label={game} sx={{ height: 20, fontSize: "0.65rem" }} />
          ))}
        </Stack>
      </Box>
    )}
  </Stack>
);

export const AnalysisStructuredData = ({
  data,
  onJumpTo,
}: {
  data: AiStructuredData;
  onJumpTo?: (seconds: number) => void;
}) => {
  switch (data.contentType) {
    case "pc_review_settings":
      return <PcReviewSettings data={data} onJumpTo={onJumpTo} />;
    case "platform_tech_review":
      return <PlatformTechReview data={data} onJumpTo={onJumpTo} />;
    case "hands_on_preview":
      return <HandsOnPreview data={data} onJumpTo={onJumpTo} />;
    case "hardware_review":
      return <HardwareReview data={data} onJumpTo={onJumpTo} />;
    case "qa_roundtable":
    case "news_discussion":
    case "roundup_list":
      return <SegmentList segments={data.segments} onJumpTo={onJumpTo} />;
    default:
      return null;
  }
};

export { NotStated, SectionLabel };
