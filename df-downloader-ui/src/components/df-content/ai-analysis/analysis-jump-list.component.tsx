import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { AiAnalysisResult, secondsToHHMMSS } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchAiAnalysis } from "../../../api/ai-analysis.ts";
import { monoFontFamily } from "../../../themes/build-theme.ts";

/**
 * What the analysis found, as places in the video.
 *
 * The analysis panel presents findings by kind - platforms, settings,
 * topics - because that is how you read them. Beside a playing video the
 * useful order is different: what happens next. So this flattens every
 * anchored finding into one list in time order, which is the same
 * information arranged for watching rather than for reading.
 *
 * Only findings that actually resolved to a moment appear. One whose quote
 * could not be located has nothing to offer a list like this, and padding
 * it out with unclickable rows would make the list worse.
 */

type Jump = {
  seconds: number;
  label: string;
  detail?: string;
};

/**
 * Taken from the result's own field rather than the exported union: known
 * issues are parsed through a preprocess that lifts legacy strings, and its
 * unknown input side means the two do not unify by identity.
 */
type StructuredData = AiAnalysisResult["structuredData"];

const jumpsFrom = (data: StructuredData): Jump[] => {
  if (!data) {
    return [];
  }
  const jumps: Jump[] = [];
  const push = (seconds: number | null | undefined, label: string, detail?: string) => {
    if (seconds != null) {
      jumps.push({ seconds, label, detail });
    }
  };

  switch (data.contentType) {
    case "console_comparison":
      for (const platform of data.platforms) {
        for (const mode of platform.modes) {
          push(mode.timestampSeconds, `${platform.platform} · ${mode.label}`, mode.resolution ?? undefined);
        }
      }
      for (const known of data.knownIssues) {
        push(known.timestampSeconds, known.issue);
      }
      break;
    case "pc_review_settings":
      for (const setting of data.settings) {
        push(setting.timestampSeconds, setting.name, setting.recommendation ?? undefined);
      }
      break;
    case "qa_roundtable":
      for (const segment of data.segments) {
        push(segment.timestampSeconds, segment.topic, segment.conclusion ?? undefined);
      }
      break;
  }

  return jumps.sort((a, b) => a.seconds - b.seconds);
};

export type AnalysisJumpListProps = {
  contentKey: string;
  onJumpTo: (seconds: number) => void;
  /** Highlights the row covering the current playback position. */
  currentSeconds?: number;
};

export const AnalysisJumpList = ({ contentKey, onJumpTo, currentSeconds }: AnalysisJumpListProps) => {
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAiAnalysis(contentKey)
      .then((value) => {
        if (!cancelled) {
          setResult(value);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contentKey]);

  const jumps = useMemo(() => jumpsFrom(result?.structuredData), [result]);

  // The row you are inside, not the one nearest - the last one that has
  // started. Same rule the chapter list follows.
  const activeIndex = useMemo(() => {
    if (currentSeconds == null) {
      return -1;
    }
    let index = -1;
    for (let i = 0; i < jumps.length; i++) {
      if (jumps[i].seconds <= currentSeconds) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }, [jumps, currentSeconds]);

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          Loading analysis…
        </Typography>
      </Stack>
    );
  }

  // Nothing to show is the common case for an item analysed before findings
  // carried anchors, and for one with no transcript to quote. Silence is the
  // right answer - an empty panel explaining itself would be noise beside a
  // video.
  if (!jumps.length) {
    return null;
  }

  return (
    <Box>
      <Typography variant="overline" sx={{ display: "block", color: "text.secondary" }}>
        {`From the analysis · ${jumps.length}`}
      </Typography>
      <Stack sx={{ mt: 0.5 }}>
        {jumps.map((jump, index) => {
          const active = index === activeIndex;
          return (
            <Box
              key={`${jump.seconds}-${jump.label}`}
              role="button"
              tabIndex={0}
              onClick={() => onJumpTo(jump.seconds)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJumpTo(jump.seconds);
                }
              }}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "baseline",
                px: 1,
                py: 0.75,
                cursor: "pointer",
                borderLeft: 2,
                borderColor: active ? "primary.main" : "transparent",
                backgroundColor: active ? "action.selected" : "transparent",
                "&:hover": { backgroundColor: "action.hover" },
                "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: -2 },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontFamily: monoFontFamily,
                  color: "primary.main",
                  flex: "0 0 auto",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {secondsToHHMMSS(Math.floor(jump.seconds))}
              </Typography>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ lineHeight: 1.3 }}>
                  {jump.label}
                </Typography>
                {jump.detail && (
                  <Typography variant="caption" sx={{ color: "text.disabled", display: "block" }}>
                    {jump.detail}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};
