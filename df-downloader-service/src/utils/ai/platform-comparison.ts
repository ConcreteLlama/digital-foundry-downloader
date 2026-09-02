import {
  PlatformComparisonResponse,
  PlatformComparisonRow,
  PlatformMode,
  UnrecognisedPlatform,
  TABLE_PLATFORMS,
  canonicalisePlatform,
  isTablePlatform,
} from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * Builds the platform comparison ledger.
 *
 * Nothing here aggregates: it collects each comparison's per-platform
 * figures and puts them side by side. See the model in
 * df-downloader-common/src/models/platform-comparison.ts for why there is
 * no score column and why modes are not aligned across platforms - both
 * are conclusions from the real data rather than defaults.
 */
export const buildPlatformComparison = async (
  db: DfDownloaderOperationalDb
): Promise<PlatformComparisonResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const libraryCount = (await db.getAllContentNames()).length;

  const rows: PlatformComparisonRow[] = [];
  const platformsPresent = new Set<string>();
  const coverage = { totalModes: 0, withResolution: 0, withFpsTarget: 0, withMeasuredAvg: 0 };

  for (const { contentKey, result } of results) {
    const data = result.structuredData;
    if (data?.contentType !== "platform_comparison") {
      continue;
    }
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      continue;
    }

    const platforms: Record<string, PlatformMode[]> = {};
    const unrecognised: UnrecognisedPlatform[] = [];

    for (const platform of data.platforms) {
      const modes: PlatformMode[] = platform.modes.map((mode) => ({
        label: mode.label,
        resolution: mode.resolution,
        fpsTarget: mode.fpsTarget,
        fpsMeasuredAvg: mode.fpsMeasuredAvg,
        notes: mode.notes,
      }));

      for (const mode of modes) {
        coverage.totalModes++;
        if (mode.resolution) coverage.withResolution++;
        if (mode.fpsTarget != null) coverage.withFpsTarget++;
        if (mode.fpsMeasuredAvg != null) coverage.withMeasuredAvg++;
      }

      const canonical = canonicalisePlatform(platform.platform);
      if (isTablePlatform(canonical.label)) {
        // Merged rather than replaced: one comparison can list a platform
        // twice under different spellings, and dropping the second set of
        // modes would lose real data to a naming inconsistency.
        platforms[canonical.label] = [...(platforms[canonical.label] ?? []), ...modes];
        platformsPresent.add(canonical.label);
      } else {
        unrecognised.push({ platform: platform.platform, modes });
      }
    }

    rows.push({
      contentKey,
      title: entry.contentInfo.title,
      publishedDate: entry.contentInfo.publishedDate,
      game: data.game,
      developer: data.developer,
      platforms,
      unrecognised,
      // Flattened back to text: this is the cross-library table, which has
      // no player to jump into, so an issue's anchor is of no use here.
      knownIssues: data.knownIssues.map((known) => known.issue),
      recommendation: data.recommendation,
      hasArticle: result.evidence.includes("article"),
      usedTranscript: result.evidence.includes("transcript"),
    });
  }

  rows.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());

  return {
    rows,
    // Ordered by the canonical list rather than alphabetically or by first
    // appearance: PS5 belongs next to PS5 Pro, not next to PC, and the
    // columns must not reshuffle as more content is analysed.
    platformsPresent: TABLE_PLATFORMS.filter((platform) => platformsPresent.has(platform)),
    comparisonCount: rows.length,
    analysedCount: results.length,
    libraryCount,
    coverage,
  };
};
