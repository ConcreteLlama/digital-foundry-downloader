import { ActionReducerMapBuilder, createAction } from "@reduxjs/toolkit";
import { DfUiError, ensureDfUiError } from "../utils/error";
import { AppStartListening } from "./listener";
import { z } from "zod";
import { fetchJson } from "../utils/fetch";
import { parseResponseBody } from "df-downloader-common";
import { isEqual } from "lodash";
import { createSelectorCreator, defaultMemoize } from "reselect";

export const createQueryActions = <START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD = DfUiError>(
  queryNamespace: string,
  queryName: string
) => {
  return {
    start: createAction<START_PAYLOAD>(`${queryNamespace}/${queryName}_START`),
    success: createAction<SUCCESS_PAYLOAD>(`${queryNamespace}/${queryName}_SUCCESS`),
    failed: createAction<ERROR_PAYLOAD>(`${queryNamespace}/${queryName}_FAILED`),
  };
};

type FetchListenerOpts<T extends z.ZodTypeAny, SUCCESS_PAYLOAD> = {
  generateSuccessPayload: (data: z.infer<T>) => SUCCESS_PAYLOAD;
};

export function addFetchListener<
  T extends z.ZodTypeAny,
  START_PAYLOAD,
  SUCCESS_PAYLOAD extends z.infer<T>,
  ERROR_PAYLOAD
>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts?: FetchListenerOpts<T, SUCCESS_PAYLOAD>
): void;
export function addFetchListener<T extends z.ZodTypeAny, START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts: FetchListenerOpts<T, SUCCESS_PAYLOAD>
): void;
export function addFetchListener<
  T extends z.ZodTypeAny,
  START_PAYLOAD,
  SUCCESS_PAYLOAD extends z.infer<T>,
  ERROR_PAYLOAD
>(
  startListening: AppStartListening,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, ERROR_PAYLOAD>>,
  responseSchema: T,
  makeFetchProps: (payload: START_PAYLOAD) => [RequestInfo, RequestInit?],
  opts: FetchListenerOpts<T, SUCCESS_PAYLOAD> = {
    generateSuccessPayload: (data) => data,
  }
) {
  startListening({
    actionCreator: queryActions.start,
    effect: async (action, listenerApi) => {
      try {
        const [url, requestOpts = {}] = makeFetchProps(action.payload);
        const data = await fetchJson(url, requestOpts);
        const result = parseResponseBody(data, responseSchema);
        if (result.data) {
          const successPayload = opts.generateSuccessPayload(result.data);
          listenerApi.dispatch(queryActions.success(successPayload));
        } else {
          console.error(result.error);
          listenerApi.dispatch(queryActions.failed(ensureDfUiError(result.error)));
        }
      } catch (e) {
        console.error(e);
        listenerApi.dispatch(queryActions.failed(ensureDfUiError(e)));
      }
    },
  });
}

export interface QueryableState {
  loading: boolean;
  error: unknown | null;
}

export const addQueryCases = <STATE extends QueryableState, START_PAYLOAD, SUCCESS_PAYLOAD, FAILED_PAYLOAD = any>(
  builder: ActionReducerMapBuilder<STATE>,
  queryActions: ReturnType<typeof createQueryActions<START_PAYLOAD, SUCCESS_PAYLOAD, FAILED_PAYLOAD>>,
  caseExtensions: {
    start?: (state: STATE, actionPayload: START_PAYLOAD) => STATE;
    success?: (state: STATE, actionPayload: SUCCESS_PAYLOAD) => STATE;
    failed?: (state: STATE, actionPayload: FAILED_PAYLOAD) => STATE;
  } = {}
) => {
  const { start, success, failed } = caseExtensions;
  builder.addCase(queryActions.start, (state, action) => {
    const newState: any = {
      ...state,
      loading: true,
    };
    return start ? start(newState, action.payload) : newState;
  });
  builder.addCase(queryActions.failed, (state, action) => {
    const newState: any = {
      ...state,
      loading: false,
      error: action.payload,
    };
    return failed ? failed(newState, action.payload) : newState;
  });
  builder.addCase(queryActions.success, (state, action) => {
    const newState: any = {
      ...state,
      tags: action.payload.tags,
      error: null,
      loading: false,
    };
    return success ? success(newState, action.payload) : newState;
  });
};

export const createDeepEqualSelector = createSelectorCreator(defaultMemoize, isEqual);
export const createShallowEqualSelector = createSelectorCreator(defaultMemoize, (a, b) => a === b);
