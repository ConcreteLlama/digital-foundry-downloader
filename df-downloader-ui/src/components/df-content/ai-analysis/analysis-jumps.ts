import { AiAnalysisResult } from "df-downloader-common";
import { useEffect, useMemo, useState } from "react";
import { fetchAiAnalysis } from "../../../api/ai-analysis.ts";

/**
 * What the analysis found, as places in the video.
 *
 * The analysis panel presents findings by kind - platforms, settings,
 * topics - because that is how you read them. Beside a playing video the
 * useful order is different: what happens next. So this flattens every
 * anchored finding into one shape the player's timeline can interleave with
 * the file's own chapters.
 *
 * Only findings that actually resolved to a moment survive. One whose quote
 * could not be located has nothing to offer a timeline, and padding it out
 * with unclickable rows would make the list worse.
 */
export type AnalysisJump = {
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

export const analysisJumpsFrom = (data: StructuredData): AnalysisJump[] => {
  if (!data) {
    return [];
  }
  const jumps: AnalysisJump[] = [];
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

/**
 * Fetches the analysis for a piece of content and reduces it to jumps.
 *
 * Returns an empty list for everything that has no analysis, was analysed
 * before findings carried anchors, or had no transcript to quote - all of
 * which are ordinary, so none of them are errors. A caller can render the
 * timeline the same way regardless.
 */
export const useAnalysisJumps = (contentKey: string, enabled = true) => {
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      return;
    }
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
  }, [contentKey, enabled]);

  const jumps = useMemo(() => analysisJumpsFrom(result?.structuredData), [result]);
  return { jumps, loading };
};
