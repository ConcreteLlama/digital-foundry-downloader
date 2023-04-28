import { createAction } from "@reduxjs/toolkit";
import { DfContentEntry, DfContentInfoQueryParams, DfContentQueryResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

//TODO: Create a separate query store

export const queryDfContentInfo = createQueryActions<void, DfContentQueryResponse>(
  "dfContent",
  "QUERY_DF_CONTENT_INFO"
);

export const updateDfContentInfoQuery = createAction<Partial<DfContentInfoQueryParams>>("dfContent/UPDATE_QUERY");
export const setDfContentInfoQuery = createAction<DfContentInfoQueryParams>("dfContent/SET_QUERY");
export const resetDfContentInfoQuery = createAction<DfContentInfoQueryParams>("dfContent/RESET_QUERY");

export const fetchSingleDfContentInfo = createQueryActions<string, DfContentEntry>(
  "dfContent",
  "dfContent/FETCH_SINGLE_DF_CONTENT_INFO"
);

export const setSelectedItem = createAction<string | null>("dfContent/SELECT_ITEM");

export const setSearchOpen = createAction<boolean>("dfContent/SET_SEARCH_OPEN");

export const resetState = createAction("dfContent/RESET_STATE");
