import {
  BulkBackfillCandidatesResponse,
  BulkBackfillEstimate,
  BulkBackfillStartedResponse,
  BulkBackfillTarget,
  parseResponseBody,
} from "df-downloader-common";
import { z, ZodTypeAny } from "zod";
import { API_URL } from "../config.ts";
import { fetchJson, postJson } from "../utils/fetch.ts";

const unwrap = <T extends ZodTypeAny>(response: unknown, schema: T): z.infer<T> => {
  const parsed = parseResponseBody(response, schema);
  if (parsed.error || parsed.data === undefined) {
    throw new Error(parsed.error?.message ?? "Unexpected response from the server");
  }
  return parsed.data;
};

/**
 * The items a target can act on, with what each already has.
 *
 * Scoped by target server-side, so asking about subtitles returns the
 * downloaded items rather than the whole library.
 */
export const fetchBackfillCandidates = async (
  target: BulkBackfillTarget,
  language = "en"
): Promise<BulkBackfillCandidatesResponse> => {
  const response = await fetchJson(
    `${API_URL}/backfill/candidates?target=${encodeURIComponent(target)}&language=${encodeURIComponent(language)}`
  );
  return unwrap(response, BulkBackfillCandidatesResponse);
};

export const estimateBackfill = async (
  target: BulkBackfillTarget,
  contentKeys: string[],
  force: boolean
): Promise<BulkBackfillEstimate> => {
  const response = await postJson(`${API_URL}/backfill/estimate`, { target, contentKeys, force });
  return unwrap(response, BulkBackfillEstimate);
};

export const runBackfill = async (
  target: BulkBackfillTarget,
  contentKeys: string[],
  force: boolean
): Promise<BulkBackfillStartedResponse> => {
  const response = await postJson(`${API_URL}/backfill/run`, { target, contentKeys, force });
  return unwrap(response, BulkBackfillStartedResponse);
};
