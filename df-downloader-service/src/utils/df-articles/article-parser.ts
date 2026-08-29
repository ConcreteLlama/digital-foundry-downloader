import * as cheerio from "cheerio";

/**
 * Parsing for digitalfoundry.net article pages.
 *
 * Article pages are fully server-rendered, so a plain authenticated fetch
 * is enough - unlike the site's own search, which is a Google Custom
 * Search widget rendered entirely client-side and therefore useless to a
 * scraper (see article-lookup.ts for what is used instead).
 */

export type ParsedArticle = {
  title: string;
  /**
   * Every distinct YouTube video embedded in the article, in page order.
   *
   * A list rather than a single value because an article does not
   * necessarily embed exactly one video. A companion piece normally does
   * (the same ID appears two or three times, as the nocookie and standard
   * variants), but a roundup embeds several, and an article can lead with
   * a trailer before the video it is actually about. Reading only the
   * first embed gets both of those wrong: it rejects a correct article
   * whose own video is not first, and it mis-attributes a roundup to
   * whichever video happens to lead.
   */
  youtubeVideoIds: string[];
  /** The first embed, kept for display. Not sufficient for matching - use the list. */
  youtubeVideoId?: string;
  text: string;
  author?: string;
};

/**
 * Every distinct YouTube video embedded in the page, in order.
 *
 * The IDs live only in iframe `src` attributes. Worth stating because it
 * rules out the obvious approach: they are not indexed anywhere as
 * searchable text, so neither DF's own search nor a site-scoped web search
 * can find an article by video ID. They can only be read from a page
 * already fetched - which is why matching is search-by-title then
 * verify-by-ID rather than a direct lookup.
 *
 * Deduplicated because the same video is normally embedded more than once
 * per page (the nocookie and standard variants both appear), and a repeat
 * says nothing about how many videos the article actually covers.
 */
const extractYoutubeVideoIds = (html: string): string[] => {
  const matches = html.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/g);
  return [...new Set([...matches].map((match) => match[1]))];
};

/**
 * Flattens a rendered HTML table into text.
 *
 * Kept rather than stripped because for a PC review this table often *is*
 * the settings recommendation - the exact structure the analysis would
 * otherwise reconstruct from spoken prose. A pipe-separated row keeps the
 * column association intact for a reader that only sees plain text.
 */
const tableToText = ($: cheerio.CheerioAPI, table: any): string => {
  const rows: string[] = [];
  $(table)
    .find("tr")
    .each((_index, tr) => {
      const cells = $(tr)
        .find("th,td")
        .map((_cellIndex, cell) => $(cell).text().trim().replace(/\s+/g, " "))
        .get();
      if (cells.some((cell) => cell.length)) {
        rows.push(cells.join(" | "));
      }
    });
  return rows.length ? `TABLE:\n${rows.join("\n")}` : "";
};

/**
 * Pulls the author's name out of the byline.
 *
 * The byline element runs the name straight into the publication date with
 * no separator ("by A N OtherThu 30th Jul 2026"), so the raw text is not
 * usable as a name. Cut at the first weekday or digit, which is where the
 * date reliably begins, and drop the leading "by".
 */
const extractAuthor = ($: cheerio.CheerioAPI): string | undefined => {
  const raw = $('[rel="author"], .author, .byline').first().text().trim();
  if (!raw) {
    return undefined;
  }
  const name = raw
    .replace(/^\s*by\s+/i, "")
    .split(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s|\d/)[0]
    .trim()
    .replace(/[,|·]\s*$/, "");
  return name || undefined;
};

export const parseArticlePage = (html: string): ParsedArticle | undefined => {
  const $ = cheerio.load(html);
  const article = $("article#article").first();
  if (!article.length) {
    return undefined;
  }

  const title = ($("h1").first().text() || $("title").text()).trim().replace(/\s*\|\s*Digital Foundry\s*$/i, "");

  // Related-article teasers and promotional furniture sit inside the same
  // container as the body. Left in, they would put another game's headline
  // into the grounding text for this one - a plausible-looking way to
  // corrupt an extraction.
  const body = article.clone();
  body.find("script, style, figure, aside, iframe, noscript, .object-related-article, .related, .newsletter, .comments").remove();

  const parts: string[] = [];
  body.find("h1, h2, h3, h4, p, li, table, blockquote").each((_index, element) => {
    const tagName = (element as any).tagName?.toLowerCase();
    if (tagName === "table") {
      const tableText = tableToText($, element);
      if (tableText) {
        parts.push(tableText);
      }
      return;
    }
    // Skip anything nested inside a table - those cells are already
    // captured above, and emitting them again would repeat the whole
    // settings table as loose sentences.
    if ($(element).parents("table").length) {
      return;
    }
    const text = $(element).text().trim().replace(/\s+/g, " ");
    if (text) {
      parts.push(text);
    }
  });

  const youtubeVideoIds = extractYoutubeVideoIds(html);
  return {
    title,
    youtubeVideoIds,
    youtubeVideoId: youtubeVideoIds[0],
    text: parts.join("\n\n"),
    author: extractAuthor($),
  };
};
