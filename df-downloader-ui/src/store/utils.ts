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
    generateSuccessPayload: (data) => data,
  }
) {
  startListening({
    actionCreator: queryActions.start,
    effect: async (action, listenerApi) => {
      const [url, requestOpts = {}] = makeFetchProps(action.payload);
      let jsonResponse: any;
      try {
        jsonResponse = await fetchJson(url, {
          ...requestOpts,
        });
        const result = parseResponseBody(jsonResponse, responseSchema);
        if (result.error) {
          console.error(`Error fetching ${url} - ${result.error}`);
          console.error("Raw payload: ", jsonResponse);
          listenerApi.dispatch(queryActions.failed(ensureDfUiError<ERROR_PAYLOAD_DETAILS>(result.error)));
        } else {
          const successPayload = opts.generateSuccessPayload(result.data);
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
