import {
  AiAnalysisSourceSelection,
  MetadataBackfillOptions,
  BulkBackfillCandidatesResponse,
  BulkBackfillEstimate,
  BulkBackfillStartedResponse,
  BulkBackfillTarget,
  parseResponseBody,
  BulkBackfillStopResponse,
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
  force: boolean,
  sources?: AiAnalysisSourceSelection,
  metadataOptions?: MetadataBackfillOptions
): Promise<BulkBackfillEstimate> => {
  const response = await postJson(`${API_URL}/backfill/estimate`, { target, contentKeys, force, sources, metadataOptions});
  return unwrap(response, BulkBackfillEstimate);
};

export const runBackfill = async (
  target: BulkBackfillTarget,
  contentKeys: string[],
  force: boolean,
  /** Analysis only - which sources this run may read. Omitted uses the configured defaults. */
  sources?: AiAnalysisSourceSelection,
  /** Metadata only - what to gather before rewriting. */
  metadataOptions?: MetadataBackfillOptions
): Promise<BulkBackfillStartedResponse> => {
  const response = await postJson(`${API_URL}/backfill/run`, {
    target,
    contentKeys,
    force,
    sources,
    metadataOptions,
  });
  return unwrap(response, BulkBackfillStartedResponse);
};

/**
 * Stop the work one or more runs left in the queue.
 *
 * By run id: a run finishes dispatching almost at once, so several can have
 * work in flight together, and stopping one must not take the others - or
 * anything queued by hand - with it.
 */
export const stopBackfillJobs = async (backfillJobIds: string[]): Promise<BulkBackfillStopResponse> => {
  const response = await postJson(`${API_URL}/backfill/stop`, { backfillJobIds });
  return unwrap(response, BulkBackfillStopResponse);
};
