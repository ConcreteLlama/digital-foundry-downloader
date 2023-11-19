import { createAction } from "@reduxjs/toolkit";
import { DfContentEntry, DfContentEntrySearchBodyInput, DfContentEntrySearchResponse, DfContentInfoRefreshMetaResponse } from "df-downloader-common";
import { createQueryActions } from "../utils";

//TODO: Create a separate query store

export const queryDfContent = createQueryActions<void, DfContentEntrySearchResponse>("dfContent", "QUERY_DF_CONTENT");

export const updateDfContentQuery = createAction<DfContentEntrySearchBodyInput>("dfContent/UPDATE_QUERY");
export const setDfContentQuery = createAction<DfContentEntrySearchBodyInput>("dfContent/SET_QUERY");
export const resetDfContentQuery = createAction("dfContent/RESET_QUERY");
export const refreshDfContentMeta = createQueryActions<string | string[], DfContentInfoRefreshMetaResponse>("dfContent", "dfContent/REFRESH_DF_CONTENT_META");

export const fetchSingleDfContentEntry = createQueryActions<string, DfContentEntry>(
  "dfContent",
  "dfContent/FETCH_SINGLE_DF_CONTENT_ENTRY"
);

export const resetState = createAction("dfContent/RESET_STATE");
