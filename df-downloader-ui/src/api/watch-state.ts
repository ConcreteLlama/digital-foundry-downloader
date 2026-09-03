import {
  WatchState,
  WatchStateListResponse,
  WatchStateResponse,
  WatchStateSyncResult,
  parseResponseBody,
} from "df-downloader-common";
import { z, ZodTypeAny } from "zod";
import { API_URL } from "../config.ts";
import { fetchJson, postJson } from "../utils/fetch.ts";

/** Same envelope unwrapping as the other API modules - see api/ai-analysis.ts. */
const unwrap = <T extends ZodTypeAny>(response: unknown, schema: T): z.infer<T> => {
  const parsed = parseResponseBody(response, schema);
  if (parsed.error || parsed.data === undefined) {
    throw new Error(parsed.error?.message ?? "Unexpected response from the server");
  }
  return parsed.data;
};

/**
 * What this app knows about one item.
 *
 * Asking also prompts the service to refresh from any media servers, so the
 * answer to this call may be one poll old while the newer one lands - which
 * is why the player treats it as a starting point rather than the truth.
 */
export const fetchWatchState = async (contentKey: string): Promise<WatchState | undefined> => {
  const response = await fetchJson(`${API_URL}/watch-state/${encodeURIComponent(contentKey)}`);
  return unwrap(response, WatchStateResponse).watchState;
};

/** Everything known, for list views drawing a watched marker per row. */
export const fetchAllWatchState = async (): Promise<WatchState[]> => {
  const response = await fetchJson(`${API_URL}/watch-state`);
  return unwrap(response, WatchStateListResponse).watchStates;
};

/**
 * Pull from the media servers now, rather than waiting for the timer.
 *
 * Reports what each server recognised, so "nothing changed" can be told apart
 * from "your path mapping is wrong" - the two look identical otherwise.
 */
export const syncWatchStateNow = async (): Promise<WatchStateSyncResult> => {
  const response = await postJson(`${API_URL}/watch-state/sync`, {});
  return unwrap(response, WatchStateSyncResult);
};

/** Marking something watched or unwatched by hand. */
export const setWatchState = async (
  contentKey: string,
  update: { watched?: boolean; positionSeconds?: number; durationSeconds?: number }
): Promise<WatchState | undefined> => {
  const response = await postJson(`${API_URL}/watch-state/${encodeURIComponent(contentKey)}`, update);
  return unwrap(response, WatchStateResponse).watchState;
};
