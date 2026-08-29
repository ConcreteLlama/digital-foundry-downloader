import {
  AiAnalysisCostEstimate,
  AiAnalysisIndexEntry,
  AiAnalysisResult,
  AiTagStatus,
  DfArticle,
  parseResponseBody,
} from "df-downloader-common";
import { z } from "zod";
import { ZodTypeAny } from "zod";
import { API_URL } from "../config.ts";
import { fetchJson, postJson } from "../utils/fetch.ts";

/**
 * Unwraps the standard {success, data} / {success:false, error} envelope.
 *
 * parseResponseBody validates but hands back both halves; every call here
 * wants the data or an exception, so the unwrapping lives in one place
 * rather than being repeated per endpoint.
 */
const unwrap = <T extends ZodTypeAny>(response: unknown, schema: T): z.infer<T> => {
  const parsed = parseResponseBody(response, schema);
  if (parsed.error || parsed.data === undefined) {
    throw new Error(parsed.error?.message ?? "Unexpected response from the server");
  }
  return parsed.data;
};

/**
 * A stored analysis, or null when the item has never been analysed.
 *
 * Never analysed is an ordinary state rather than an error - most of the
 * library will be in it - so it comes back as null instead of throwing.
 */
export const fetchAiAnalysis = async (contentKey: string): Promise<AiAnalysisResult | null> => {
  try {
    const response = await fetchJson(`${API_URL}/ai-analysis/result/${encodeURIComponent(contentKey)}`);
    return unwrap(response, AiAnalysisResult);
  } catch (e) {
    return null;
  }
};

const AiAnalysisIndexResponse = z.object({
  entries: z.record(z.string(), AiAnalysisIndexEntry),
});

/**
 * The whole index in one request.
 *
 * Fetched as a lump rather than per row: it is small enough to hold
 * client-side for the entire archive, and the alternative is one request
 * per visible content row purely to decide whether to draw a badge.
 */
export const fetchAiAnalysisIndex = async (): Promise<Record<string, AiAnalysisIndexEntry>> => {
  const response = await fetchJson(`${API_URL}/ai-analysis/index`);
  return unwrap(response, AiAnalysisIndexResponse).entries;
};

export const estimateAiAnalysisCost = async (contentKey: string): Promise<AiAnalysisCostEstimate> => {
  const response = await postJson(`${API_URL}/ai-analysis/estimate`, { contentKey, force: false });
  return unwrap(response, AiAnalysisCostEstimate);
};

export const startAiAnalysis = async (contentKey: string, force = false) =>
  postJson(`${API_URL}/ai-analysis/analyse`, { contentKey, force });

export const decideAiTag = async (contentKey: string, tag: string, status: AiTagStatus): Promise<AiAnalysisResult> => {
  const response = await postJson(`${API_URL}/ai-analysis/tag-decision`, { contentKey, tag, status });
  return unwrap(response, AiAnalysisResult);
};

/**
 * What is known about a matching Digital Foundry article.
 *
 * `search` is opt-in on purpose: reading this on a panel open must not
 * generate site traffic, so a plain read returns only what is already
 * stored and searching is something the person asks for.
 */
export const DfArticleLookupResponse = z.object({
  article: DfArticle.nullable(),
  lastAttemptedAt: z.coerce.date().nullable(),
  missCount: z.number().default(0),
  nextRetryAt: z.coerce.date().nullable(),
  lastError: z.string().nullable(),
  searchDue: z.boolean().default(true),
});
export type DfArticleLookupResponse = z.infer<typeof DfArticleLookupResponse>;

export const fetchDfArticle = async (
  contentKey: string,
  opts: { search?: boolean; force?: boolean } = {}
): Promise<DfArticleLookupResponse> => {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", "true");
  if (opts.force) params.set("force", "true");
  const query = params.toString();
  const response = await fetchJson(
    `${API_URL}/ai-analysis/article/${encodeURIComponent(contentKey)}${query ? `?${query}` : ""}`
  );
  return unwrap(response, DfArticleLookupResponse);
};
