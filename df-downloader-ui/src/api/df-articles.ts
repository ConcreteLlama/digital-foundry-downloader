import { DfArticleListingResponse, parseResponseBody } from "df-downloader-common";
import { API_URL } from "../config.ts";
import { fetchJson } from "../utils/fetch.ts";

/**
 * The articles this installation knows about.
 *
 * Served from the metadata cache, so this costs Digital Foundry nothing
 * however often it is opened - see the service's rest/api/df-articles.ts.
 */
export const fetchDfArticles = async (): Promise<DfArticleListingResponse> => {
  const result = await fetchJson(`${API_URL}/df-articles`, { method: "GET" });
  const parsed = parseResponseBody(result, DfArticleListingResponse);
  if (parsed.error || parsed.data === undefined) {
    throw new Error(parsed.error?.message ?? "Could not read the article list");
  }
  return parsed.data;
};
