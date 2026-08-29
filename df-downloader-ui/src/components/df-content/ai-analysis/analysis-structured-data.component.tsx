import {
  Box,
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
  AiConsoleComparisonData,
  AiPcReviewSettingsData,
  AiQaRoundtableData,
  AiStructuredData,
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

const PcReviewSettings = ({ data }: { data: AiPcReviewSettingsData }) => {
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
                      {setting.name}
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
const ConsoleComparison = ({ data }: { data: AiConsoleComparisonData }) => (
  <Stack spacing={2}>
    {(data.game || data.developer) && (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {data.game}
        {data.developer ? ` · ${data.developer}` : ""}
      </Typography>
    )}
    <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
      {data.platforms.map((platform) => (
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
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {mode.label}
                </Typography>
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
    {data.knownIssues.length > 0 && (
      <Box>
        <SectionLabel>Known issues</SectionLabel>
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, color: "text.secondary" }}>
          {data.knownIssues.map((issue, index) => (
            <Typography component="li" variant="body2" key={index}>
              {issue}
            </Typography>
          ))}
        </Box>
      </Box>
    )}
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
 * Per-segment, because a roundtable holds several independent and
 * sometimes contradicting views that one summary would flatten. A topic
 * the participants left unresolved says so rather than being given a
 * verdict it never reached.
 */
const QaRoundtable = ({ data }: { data: AiQaRoundtableData }) => (
  <Stack spacing={1}>
    {data.segments.map((segment, index) => (
      <Paper key={index} variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
          {segment.topic}
        </Typography>
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

export const AnalysisStructuredData = ({ data }: { data: AiStructuredData }) => {
  switch (data.contentType) {
    case "pc_review_settings":
      return <PcReviewSettings data={data} />;
    case "console_comparison":
      return <ConsoleComparison data={data} />;
    case "qa_roundtable":
      return <QaRoundtable data={data} />;
    default:
      return null;
  }
};

export { NotStated, SectionLabel };
