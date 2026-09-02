import { AnalysisCatalogueEntry, AnalysisCatalogueResponse } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * Every analysed item as one flat, filterable list.
 *
 * Exists because content type is the most load-bearing thing the analysis
 * produces - it decides what gets extracted and what the item is filed as -
 * and until now there was nowhere to see it across the library. The specialised
 * views each show one slice; this shows the corpus.
 *
 * Deliberately a section of Analysis rather than a filter on the Content list.
 * Only a fraction of the library is analysed, so a content-type filter there
 * would silently hide almost everything; here the scope is implied by where
 * the reader already is, and the header states the share outright.
 *
 * Built server-side for the same reason the game index is: the analysis index
 * carries no titles, and shipping every stored result to the browser to draw
 * a list would move several kilobytes per row for a handful of fields.
 */
export const buildAnalysisCatalogue = async (
  db: DfDownloaderOperationalDb
): Promise<AnalysisCatalogueResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const libraryCount = (await db.getAllContentNames()).length;
  const entries: AnalysisCatalogueEntry[] = [];

  for (const { contentKey, result } of results) {
    const entry = await db.getContentEntry(contentKey);
    // Content deleted since it was analysed - there is nothing sensible to
    // show for it, so it is left out rather than listed under its key.
    if (!entry) {
      continue;
    }
    entries.push({
      contentKey,
      title: entry.contentInfo.title,
      publishedDate: entry.contentInfo.publishedDate,
      analysedAt: result.analysedAt,
      contentType: result.contentType,
      model: result.model,
      primaryGame: result.primaryGame,
      evidence: result.evidence,
      hasError: Boolean(result.error),
      hasStructuredData: Boolean(result.structuredData),
    });
  }

  entries.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());
  return { entries, libraryCount };
};
