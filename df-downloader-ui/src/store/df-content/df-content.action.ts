import { createAction } from "@reduxjs/toolkit";
import { DfContentEntry, DfContentInfoQueryParams, DfContentQueryResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

//TODO: Create a separate query store

export const queryDfContent = createQueryActions<void, DfContentQueryResponse>("dfContent", "QUERY_DF_CONTENT");

export const updateDfContentQuery = createAction<Partial<DfContentInfoQueryParams>>("dfContent/UPDATE_QUERY");
export const setDfContentQuery = createAction<DfContentInfoQueryParams>("dfContent/SET_QUERY");
export const resetDfContentQuery = createAction<DfContentInfoQueryParams>("dfContent/RESET_QUERY");

export const fetchSingleDfContentEntry = createQueryActions<string, DfContentEntry>(
  "dfContent",
  "dfContent/FETCH_SINGLE_DF_CONTENT_ENTRY"
);

export const resetState = createAction("dfContent/RESET_STATE");
