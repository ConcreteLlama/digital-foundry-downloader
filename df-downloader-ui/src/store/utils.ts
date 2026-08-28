import { ActionReducerMapBuilder, Draft, createAction } from "@reduxjs/toolkit";
import { logger, parseResponseBody } from "df-downloader-common";
import { DfContentDownloadInfo } from "df-downloader-common/models/df-content-download-info";
import { isEqual, isFunction } from "lodash";
import { createSelectorCreator, lruMemoize } from "reselect";
import { z } from "zod";
import { DfUiError, ensureDfUiError, isDfUiError } from "../utils/error";
import { fetchJson } from "../utils/fetch";
import { userLoggedOut } from "./auth-user/auth-user.simple-actions.ts";
import { AppStartListening } from "./listener";

export const createQueryActions = <START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD_DETAILS = any>(
  queryNamespace: string,
  queryName: string
) => {
  return {
    start: createAction<START_PAYLOAD>(`${queryNamespace}/${queryName}_START`),
    success: createAction<SUCCESS_PAYLOAD>(`${queryNamespace}/${queryName}_SUCCESS`),
    failed: createAction<DfUiError<ERROR_PAYLOAD_DETAILS>>(`${queryNamespace}/${queryName}_FAILED`),
  };
};

type FetchListenerOpts<T extends z.ZodTypeAny, SUCCESS_PAYLOAD> = {
  generateSuccessPayload: (data: z.infer<T>) => SUCCESS_PAYLOAD;
};

/**
 * In-flight requests, keyed by exactly what is being sent. Two dispatches of
 * the same query with the same payload can only be asking for the same thing,
 * so the second joins the first's response rather than issuing a second HTTP
 * request - both still dispatch their own success/failed action, so nothing
 * downstream can tell the difference.
 *
 * This exists because React.StrictMode (see main.tsx) deliberately runs every
 * effect twice in dev, and the content detail dialog kicks off its metadata
 * refresh from one - so opening an item fired two identical
 * POST /content/entry/refresh-metadata calls, and therefore two requests to
 * Digital Foundry, the second of which sat out the 5-15s spacing gate (see
 * df-request-queue.ts). It guards genuine double-dispatch in production too.
 *
 * Applied to every query rather than just the read-only ones, which is safe
 * given what actually goes through here (see the addFetchListener call sites):
 * only *concurrent* byte-identical requests collapse, and the entry is dropped
 * the moment the request settles, so a deliberate repeat - the user doing the
 * same thing again a moment later - always goes out for real. That leaves only
 * "fire the identical mutation twice simultaneously", which for every mutating
 * endpoint here (start a download, control a task, log in, update user info) is
 * a double-click rather than an intent to do it twice. If an endpoint is ever
 * added where two identical simultaneous calls should mean two effects, it
 * needs to opt out of this.
 */
const inFlightFetches = new Map<string, Promise<any>>();

/**
 * Null for anything that can't be compared cheaply and reliably - a FormData
 * or stream body would stringify to "{}" and collide with every other one, so
 * such requests skip the dedupe rather than risk being wrongly merged.
 */
const fetchKey = (url: RequestInfo, requestOpts: RequestInit): string | null => {
  const { body } = requestOpts;
  if (body !== undefined && body !== null && typeof body !== "string") {
    return null;
  }
  // Method and body matter as much as the URL here - several endpoints are
  // POSTs whose payload is the entire query (e.g. /content/search).
  return JSON.stringify([String(url), requestOpts.method || "GET", body ?? null]);
};

/**
 * fetchJson, but collapses concurrent identical requests onto one. Rejections
 * are shared too, so a failure still reaches every caller.
 */
const dedupedFetchJson = (url: RequestInfo, requestOpts: RequestInit) => {
  const key = fetchKey(url, requestOpts);
  if (key === null) {
    return fetchJson(url, requestOpts);
  }
  const existing = inFlightFetches.get(key);
  if (existing) {
    return existing;
  }
  const pending = fetchJson(url, requestOpts).finally(() => {
    inFlightFetches.delete(key);
  });
  inFlightFetches.set(key, pending);
  return pending;
};

export function addFetchListener<
  T extends z.ZodTypeAny,
  START_PAYLOAD,
  SUCCESS_PAYLOAD extends z.infer<T>,
  ERROR_PAYLOAD_DETAILS
>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD_DETAILS>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts?: FetchListenerOpts<T, SUCCESS_PAYLOAD>
): void;
export function addFetchListener<T extends z.ZodTypeAny, START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD_DETAILS>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD_DETAILS>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts: FetchListenerOpts<T, SUCCESS_PAYLOAD>
): void;
export function addFetchListener<
  T extends z.ZodTypeAny,
  START_PAYLOAD,
  SUCCESS_PAYLOAD extends z.infer<T>,
  ERROR_PAYLOAD_DETAILS
>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD_DETAILS>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts: FetchListenerOpts<T, SUCCESS_PAYLOAD> = {
    // Only safe when SUCCESS_PAYLOAD is exactly z.infer<T> (the default
    // case when the caller doesn't supply a custom mapper) - the
    // implementation signature's `extends` bound allows narrower subtypes
    // too, which zod v4's stricter generic inference now correctly flags;
    // narrower callers are expected to supply their own generateSuccessPayload.
    generateSuccessPayload: (data) => data as SUCCESS_PAYLOAD,
  }
) {
  startListening({
    actionCreator: queryActions.start,
    effect: async (action, listenerApi) => {
      const [url, requestOpts = {}] = makeFetchProps(action.payload);
      let jsonResponse: any;
      try {
        jsonResponse = await dedupedFetchJson(url, {
          ...requestOpts,
        });
        const result = parseResponseBody(jsonResponse, responseSchema);
        if (result.error) {
          console.error(`Error fetching ${url} - ${result.error}`);
          console.error("Raw payload: ", jsonResponse);
          listenerApi.dispatch(queryActions.failed(ensureDfUiError<ERROR_PAYLOAD_DETAILS>(result.error)));
        } else {
          // result.data is guaranteed present here (parseResponseBody only
          // omits it alongside a populated `error`, and we're in the
          // `!result.error` branch) - the two fields aren't a discriminated
          // union though, so TS can't narrow that on its own.
          const successPayload = opts.generateSuccessPayload(result.data!);
          listenerApi.dispatch(queryActions.success(successPayload));
        }
      } catch (e: any) {
        logger.log("error", `Caught error fetching ${url} - ${JSON.stringify(e)}`);
        logger.log("error", "Raw payload: ", jsonResponse);
        if (isDfUiError(e)) {
          if (e.code === 401) {
            listenerApi.dispatch(userLoggedOut());
          }
        }
        listenerApi.dispatch(queryActions.failed(ensureDfUiError<ERROR_PAYLOAD_DETAILS>(e)));
      }
    },
  });
}

export interface QueryableState {
  loading: boolean;
}

export const addQueryCases = <STATE extends QueryableState, START_PAYLOAD, SUCCESS_PAYLOAD, FAILED_PAYLOAD = any>(
  builder: ActionReducerMapBuilder<STATE>,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, FAILED_PAYLOAD>>,
  caseHandlers: {
    start?: (state: Draft<STATE>, actionPayload: START_PAYLOAD) => undefined;
    success?: keyof STATE | ((state: Draft<STATE>, actionPayload: SUCCESS_PAYLOAD) => undefined);
    failed?: keyof STATE | ((state: Draft<STATE>, actionPayload: DfUiError<FAILED_PAYLOAD>) => undefined);
  } = {}
) => {
  const { start, success, failed } = caseHandlers;
  const failedKey = typeof failed === "string" ? failed : "error";
  const successKey = typeof success === "string" ? success : undefined;
  builder.addCase(queryActions.start, (state, action) => {
    const newStateAny = state as any;
    newStateAny.loading = true;
    newStateAny.error = null;
    newStateAny[failedKey] = null;
    start && start(state, action.payload);
  });
  builder.addCase(queryActions.failed, (state, action) => {
    const newStateAny = state as any;
    newStateAny.loading = false;
    (newStateAny.error = action.payload),
      (newStateAny[failedKey] = action.payload as any),
      isFunction(failed) && failed(state, action.payload);
  });
  builder.addCase(queryActions.success, (state, action) => {
    const newStateAny = state as any;
    newStateAny.loading = false;
    newStateAny.error = null;
    newStateAny[failedKey] = null;
    successKey && (newStateAny[successKey] = action.payload);
    isFunction(success) && success(state, action.payload);
  });
};

export const createShallowEqualSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: {
    resultEqualityCheck: (a, b) => a === b,
  },
});

export const createDeepEqualSelector = createSelectorCreator({
  memoize: lruMemoize,
  memoizeOptions: {
    resultEqualityCheck: isEqual,
  },
});

export const getDownloadVariant = (
  mediaType: string,
  downloadInfo: DfContentDownloadInfo | undefined,
  mediaTypesWithTasks?: string[]
) => {
  if (mediaTypesWithTasks?.includes(mediaType)) {
    return "downloading";
  } else if (downloadInfo) {
    return "downloaded";
  } else {
    return "available";
  }
};
