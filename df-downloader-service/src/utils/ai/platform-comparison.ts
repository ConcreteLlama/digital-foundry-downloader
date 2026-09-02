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
 * Nothing here aggregates: it collects each analysis's per-platform figures
 * and puts them side by side. See the model in
 * df-downloader-common/src/models/platform-comparison.ts for why there is
 * no score column and why modes are not aligned across platforms - both
 * are conclusions from the real data rather than defaults.
 *
 * ## Why both content types are drawn on
 *
 * `single_platform_analysis` carries the identical `AiPlatformEntry` shape as
 * `platform_comparison`; the only payload differences are `verdict` versus
 * `recommendation`, which are the same claim, and `changeSummary`, which the
 * ledger has no column for. game-index.ts has always read the two together.
 *
 * Filtering here on `platform_comparison` alone looked like it separated
 * face-offs from port analyses. Measured over 481 items it does not: that
 * boundary is where classification actually fails, accounting for 9 of the
 * local engine's 12 errors against hand labels, 9 of the hosted engine's 15,
 * and 10 of the 14 items the two engines disagreed on. Real face-offs land in
 * `single_platform_analysis` ("Baldur's Gate 3 PlayStation 5 vs PC") and
 * genuinely single-platform pieces land in `platform_comparison` ("Skyrim -
 * Switch 2 Review"), depending on engine and run.
 *
 * So the old filter was not excluding sparse rows, it was excluding an
 * arbitrary half of every kind of row. Both are included and the row carries
 * its `contentType`, which is the honest version: the reader is told which
 * kind of piece each row came from instead of the table quietly dropping
 * half of them.
 *
 * A genuinely single-platform row populates one column and leaves the rest
 * blank. That is not a new state for this table - `fpsMeasuredAvg` is absent
 * from roughly nine in ten modes already, and the UI renders an explicit
 * "not stated" marker for exactly this reason.
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
    if (data?.contentType !== "platform_tech_review") {
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
      /*
       * Derived from the payload, not from the classification.
       *
       * This replaces a contentType label that existed only to say whether a
       * row was a face-off. That label was a guess made from a title before
       * extraction ran; this is a count of what extraction actually found, so
       * it is right by construction rather than nine times in twelve.
       */
      isFaceOff: Object.keys(platforms).length + unrecognised.length >= 2,
      game: data.game,
      developer: data.developer,
      platforms,
      unrecognised,
      // Flattened back to text: this is the cross-library table, which has
      // no player to jump into, so an issue's anchor is of no use here.
      knownIssues: data.knownIssues.map((known) => known.issue),
      // `changeSummary` has no column here and is deliberately not squeezed
      // into this one - the row opens the full analysis, which is where that
      // belongs.
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
