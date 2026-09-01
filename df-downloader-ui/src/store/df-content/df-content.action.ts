import { createAction } from "@reduxjs/toolkit";
import { DfContentBadgesResponse, DfContentEntry, DfContentEntrySearchBodyInput, DfContentEntrySearchResponse, DfContentInfoRefreshMetaResponse } from "df-downloader-common";
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

// Lazily backfills description/duration from YouTube - the service only
// does this on request (see content.ts's fetch-youtube-meta endpoint), not
// during scans, so this should only be dispatched when the user actually
// opens the content detail view. The service caches the result, so
// repeat dispatches for an already-fetched entry are cheap no-ops.
export const fetchYtVideoMeta = createQueryActions<string, DfContentEntry>(
  "dfContent",
  "dfContent/FETCH_YT_VIDEO_META"
);

// Badges only, for rows whose badge went stale without the entry changing -
// an analysis finishing is the case this exists for. Cheap: the service reads
// two in-memory indexes, so this never touches a result file or the disk.
export const fetchContentBadges = createQueryActions<string[], DfContentBadgesResponse>(
  "dfContent",
  "dfContent/FETCH_CONTENT_BADGES"
);

export const resetState = createAction("dfContent/RESET_STATE");
