import { ActionReducerMapBuilder, createAction } from "@reduxjs/toolkit";
import { DfUiError, ensureDfUiError } from "../utils/error";
import { AppStartListening } from "./listener";
import { z } from "zod";
import { fetchJson } from "../utils/fetch";
import { logger, parseResponseBody } from "df-downloader-common";
import { isEqual, isFunction } from "lodash";
import { createSelectorCreator, defaultMemoize } from "reselect";

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
      try {
        const data = await fetchJson(url, {
          ...requestOpts,
        });
        const result = parseResponseBody(data, responseSchema);
        if (result.data) {
          const successPayload = opts.generateSuccessPayload(result.data);
          listenerApi.dispatch(queryActions.success(successPayload));
        } else {
          console.error(`Error fetching ${url} - ${result.error}`);
          listenerApi.dispatch(queryActions.failed(ensureDfUiError<ERROR_PAYLOAD_DETAILS>(result.error)));
        }
      } catch (e) {
        logger.log("error", `Error fetching ${url} - ${e}`);
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
    start?: (state: STATE, actionPayload: START_PAYLOAD) => STATE;
    success?: keyof STATE | ((state: STATE, actionPayload: SUCCESS_PAYLOAD) => STATE);
    failed?: keyof STATE | ((state: STATE, actionPayload: DfUiError<FAILED_PAYLOAD>) => STATE);
  } = {}
) => {
  const { start, success, failed } = caseHandlers;
  const failedKey = typeof failed === "string" ? failed : "error";
  const successKey = typeof success === "string" ? success : undefined;
  builder.addCase(queryActions.start, (state, action) => {
    const newState: any = {
      ...state,
      [failedKey]: null,
      error: null,
      loading: true,
    };
    return start ? start(newState, action.payload) : newState;
  });
  builder.addCase(queryActions.failed, (state, action) => {
    const newState: any = {
      ...state,
      loading: false,
      [failedKey]: action.payload as any,
      error: action.payload,
    };
    return isFunction(failed) ? failed(newState, action.payload) : newState;
  });
  builder.addCase(queryActions.success, (state, action) => {
    const newState: any = {
      ...state,
      [failedKey]: null,
      error: null,
      loading: false,
    };
    successKey && (newState[successKey] = action.payload);
    return isFunction(success) ? success(newState, action.payload) : newState;
  });
};

export const createDeepEqualSelector = createSelectorCreator(defaultMemoize, isEqual);
export const createShallowEqualSelector = createSelectorCreator(defaultMemoize, (a, b) => a === b);
