import {
  PcSettingsEntry,
  PcSettingsFrequency,
  PcSettingsIndexResponse,
  PcSettingsRow,
} from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * Builds the settings knowledge base from every analysed PC review.
 *
 * A join, like the platform comparison ledger, and for the same reason:
 * nothing here averages a performance cost across games. The percentages come
 * from different scenes, resolutions and test machines, so pooling them would
 * produce a figure that describes nothing. What is aggregated is a count -
 * how often a setting gets discussed - which is a real fact about the
 * coverage rather than a derived judgement about the setting.
 */
export const buildPcSettingsIndex = async (
  db: DfDownloaderOperationalDb
): Promise<PcSettingsIndexResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const libraryCount = (await db.getAllContentNames()).length;

  const rows: PcSettingsRow[] = [];
  const coverage = { totalSettings: 0, withStatedCost: 0, withRecommendation: 0 };
  /** setting name (lowercased) -> how many reviews, and how many stated a cost. */
  const frequency = new Map<string, { name: string; gameCount: number; withStatedCost: number }>();

  for (const { contentKey, result } of results) {
    const data = result.structuredData;
    if (data?.contentType !== "pc_review_settings") {
      continue;
    }
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      // Analysed then removed from the library - a stale result is not worth
      // resurrecting a title for.
      continue;
    }

    const settings: PcSettingsEntry[] = data.settings.map((setting) => ({
      name: setting.name,
      levelsTested: setting.levelsTested,
      perfDeltaPct: setting.perfDeltaPct,
      consoleEquivalent: setting.consoleEquivalent,
      recommendation: setting.recommendation,
      timestampSeconds: setting.timestampSeconds,
    }));

    // Counted once per review even if a review lists a setting twice, so the
    // number reads as "how many reviews discussed this".
    const seenHere = new Set<string>();
    for (const setting of settings) {
      coverage.totalSettings++;
      if (setting.perfDeltaPct != null) {
        coverage.withStatedCost++;
      }
      if (setting.recommendation) {
        coverage.withRecommendation++;
      }
      const key = setting.name.trim().toLowerCase();
      if (!key || seenHere.has(key)) {
        continue;
      }
      seenHere.add(key);
      const existing = frequency.get(key);
      if (existing) {
        existing.gameCount++;
        if (setting.perfDeltaPct != null) {
          existing.withStatedCost++;
        }
      } else {
        frequency.set(key, {
          name: setting.name.trim(),
          gameCount: 1,
          withStatedCost: setting.perfDeltaPct != null ? 1 : 0,
        });
      }
    }

    rows.push({
      contentKey,
      title: entry.contentInfo.title,
      publishedDate: entry.contentInfo.publishedDate,
      game: result.primaryGame ?? data.game,
      engine: data.engine,
      verdict: data.verdict ?? result.conclusion,
      bottleneck: data.bottleneck?.detail ?? data.bottleneck?.type,
      settings,
      optimised: data.optimisedSettingsResult
        ? {
            testSystem: data.optimisedSettingsResult.testSystem,
            fpsBefore: data.optimisedSettingsResult.fpsBefore,
            fpsAfter: data.optimisedSettingsResult.fpsAfter,
            gainPct: data.optimisedSettingsResult.gainPct,
          }
        : undefined,
      hasArticle: result.evidence.includes("article"),
      usedTranscript: result.evidence.includes("transcript"),
    });
  }

  rows.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());

  const commonSettings: PcSettingsFrequency[] = [...frequency.values()]
    .sort((a, b) => (b.gameCount !== a.gameCount ? b.gameCount - a.gameCount : a.name.localeCompare(b.name)))
    // Only settings more than one review bothered with - a list where every
    // entry says "1" describes the extraction, not the coverage.
    .filter((setting) => setting.gameCount > 1);

  return {
    rows,
    commonSettings,
    reviewCount: rows.length,
    analysedCount: results.length,
    libraryCount,
    coverage,
  };
};
