import {
  AiAnalysisResult,
  resolveAnalysisGames,
  GameGroup,
  GameIndexItem,
  GameIndexResponse,
  canonicaliseGame,
  canonicalisePlatform,
} from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * Builds the game index: analysed content grouped by the game it covers.
 *
 * This is a join, not an aggregate. Nothing here averages, ranks or scores
 * anything - it collects what Digital Foundry said about each game and
 * shows it, with their own verdict quoted rather than a derived one.
 *
 * That is a deliberate limit rather than a first step towards a
 * leaderboard. The obvious next thing - tallying which platform "wins" -
 * does not hold up against this data: `fpsMeasuredAvg` is null far more
 * often than not, and its absence is not random (a figure gets quoted when
 * the gap is worth quoting), so any average over the non-null values leans
 * consistently towards the videos with dramatic differences. See
 * docs/AI_CONTENT_ANALYSIS_PLAN.md for the full reasoning.
 */

/**
 * The game a piece is *about*, as opposed to one it merely covers.
 *
 * Falls through to the structured payload for results written before
 * `primaryGame` existed, where the game for the two types that had one was
 * the subject by definition.
 */
const primaryGameOf = (result: AiAnalysisResult): string | undefined => {
  if (result.primaryGame?.trim()) {
    return result.primaryGame.trim();
  }
  const data = result.structuredData;
  return data && "game" in data && data.game?.trim() ? data.game.trim() : undefined;
};

const platformsFor = (result: AiAnalysisResult): { labels: string[]; viaAlias: boolean } => {
  const data = result.structuredData;
  // single_platform_analysis carries the same per-platform shape as a face-off - it
  // is the same data with fewer platforms, so it reads the same way here.
  if (data?.contentType !== "platform_comparison" && data?.contentType !== "single_platform_analysis") {
    return { labels: [], viaAlias: false };
  }
  let viaAlias = false;
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const platform of data.platforms) {
    const canonical = canonicalisePlatform(platform.platform);
    viaAlias = viaAlias || canonical.viaAlias;
    if (!seen.has(canonical.key)) {
      seen.add(canonical.key);
      labels.push(canonical.label);
    }
  }
  return { labels, viaAlias };
};

/** Whichever verdict field this content type actually carries. */
const conclusionOf = (result: AiAnalysisResult): string | undefined => {
  if (result.conclusion) {
    return result.conclusion;
  }
  const data = result.structuredData;
  if (!data) {
    return undefined;
  }
  if (data.contentType === "pc_review_settings" || data.contentType === "single_platform_analysis") {
    return data.verdict ?? undefined;
  }
  if (data.contentType === "hardware_review") {
    return data.verdict ?? undefined;
  }
  return undefined;
};

export const buildGameIndex = async (db: DfDownloaderOperationalDb): Promise<GameIndexResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const libraryCount = (await db.getAllContentNames()).length;

  const groups = new Map<string, GameGroup & { rawNames: Set<string> }>();
  let ungroupedCount = 0;

  for (const { contentKey, result } of results) {
    // One field, whatever the content type. This used to read the game out of
    // the structured payload, which only two of the schemas had - so a preview
    // or a port analysis, each about exactly one game, could never appear.
    const gameNames = resolveAnalysisGames(result);
    if (!gameNames.length) {
      ungroupedCount++;
      continue;
    }
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      // Analysed then removed from the library - the stale result is not
      // worth resurrecting a title for.
      ungroupedCount++;
      continue;
    }

    const platforms = platformsFor(result);
    const data = result.structuredData;
    const primary = primaryGameOf(result)?.toLowerCase();

    // A piece can cover several games and belongs under each of them - that is
    // the whole point of a Direct being findable under what it discussed.
    for (const rawGame of gameNames) {
      const canonical = canonicaliseGame(rawGame);
      const item: GameIndexItem = {
        contentKey,
        title: entry.contentInfo.title,
        publishedDate: entry.contentInfo.publishedDate,
        contentType: result.contentType,
        conclusion: conclusionOf(result),
        platforms: platforms.labels,
        engine: data?.contentType === "pc_review_settings" ? data.engine : undefined,
        developer:
          data?.contentType === "platform_comparison" || data?.contentType === "single_platform_analysis"
            ? data.developer
            : undefined,
        hasArticle: result.evidence.includes("article"),
        usedTranscript: result.evidence.includes("transcript"),
        // No primary game means nothing here is the subject - a Direct is not
        // "about" any of the games it moved through.
        isPrimary: Boolean(primary) && rawGame.trim().toLowerCase() === primary,
      };

      const existing = groups.get(canonical.key);
      if (existing) {
        existing.items.push(item);
        existing.rawNames.add(rawGame.trim());
        existing.mergedByAlias = existing.mergedByAlias || canonical.viaAlias;
      } else {
        groups.set(canonical.key, {
          key: canonical.key,
          name: canonical.label,
          variants: [],
          mergedByAlias: canonical.viaAlias,
          items: [item],
          rawNames: new Set([rawGame.trim()]),
        });
      }
    }
  }

  const finished = [...groups.values()]
    .map(({ rawNames, ...group }) => ({
      ...group,
      // The longest spelling is usually the most complete ("Halo: Campaign
      // Evolved" over "Halo"), which makes a better heading than whichever
      // happened to be seen first.
      name: [...rawNames].sort((a, b) => b.length - a.length)[0] ?? group.name,
      variants: [...rawNames].sort(),
      items: group.items.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime()),
    }))
    // Most-covered first, then most recent - a game DF returned to
    // repeatedly is the more interesting row.
    .sort((a, b) => {
      if (b.items.length !== a.items.length) {
        return b.items.length - a.items.length;
      }
      return b.items[0].publishedDate.getTime() - a.items[0].publishedDate.getTime();
    });

  return {
    groups: finished,
    ungroupedCount,
    analysedCount: results.length,
    libraryCount,
  };
};
