import { HardwareIndexResponse, HardwareRow } from "df-downloader-common";
import { DfDownloaderOperationalDb } from "../../db/df-operational-db.js";

/**
 * Builds the hardware index from every analysed hardware review.
 *
 * Products stay attached to the review that reached the verdict rather than
 * being merged into a per-product catalogue. Digital Foundry revisit hardware
 * as drivers, firmware and prices move, so two reviews of the same card are
 * two verdicts at two moments - merging them would mean silently choosing
 * which one is current.
 */
export const buildHardwareIndex = async (db: DfDownloaderOperationalDb): Promise<HardwareIndexResponse> => {
  const results = await db.getAllAiAnalysisResults();
  const libraryCount = (await db.getAllContentNames()).length;

  const rows: HardwareRow[] = [];
  const classes = new Set<string>();

  for (const { contentKey, result } of results) {
    const data = result.structuredData;
    if (data?.contentType !== "hardware_review") {
      continue;
    }
    const entry = await db.getContentEntry(contentKey);
    if (!entry) {
      continue;
    }

    for (const product of data.products) {
      const label = product.productClass?.trim();
      if (label) {
        classes.add(label);
      }
    }

    rows.push({
      contentKey,
      title: entry.contentInfo.title,
      publishedDate: entry.contentInfo.publishedDate,
      products: data.products.map((product) => ({
        name: product.name,
        productClass: product.productClass,
        verdict: product.verdict,
        timestampSeconds: product.timestampSeconds,
      })),
      verdict: data.verdict ?? result.conclusion,
      gamesTested: data.gamesTested,
      knownIssues: data.knownIssues.map((known) => known.issue),
      hasArticle: result.evidence.includes("article"),
      usedTranscript: result.evidence.includes("transcript"),
    });
  }

  rows.sort((a, b) => b.publishedDate.getTime() - a.publishedDate.getTime());

  return {
    rows,
    classesPresent: [...classes].sort(),
    reviewCount: rows.length,
    analysedCount: results.length,
    libraryCount,
  };
};
