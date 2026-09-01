import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import {
  fetchContentBadges,
  fetchSingleDfContentEntry,
  fetchYtVideoMeta,
  queryDfContent,
  refreshDfContentMeta,
  resetDfContentQuery,
  resetState,
  setDfContentQuery,
  updateDfContentQuery,
} from "./df-content.action";
import { DefaultContentQuery, DfContentInfoState } from "./df-content.types";

const INITIAL_STATE: DfContentInfoState = {
  loading: false,
  selectedContent: [],
  content: {},
  totalItems: 0,
  currentQuery: DefaultContentQuery,
  badges: {},
  error: null,
};
export const dfContentReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryDfContent, {
    success: (state, payload) => {
      state.currentQuery = payload.params;
      state.totalItems = payload.totalResults;
      for (const content of payload.content) {
        state.content[content.key] = content;
      }
      // Merged rather than replaced, matching `content` above: paging away and
      // back should not blank the badges on rows already held.
      Object.assign(state.badges, payload.badges ?? {});
      state.selectedContent = payload.content.map((c) => c.key);
    },
  });
  addQueryCases(builder, fetchSingleDfContentEntry, {
    success: (state, payload) => {
      state.content[payload.key] = payload;
    },
  });
  addQueryCases(builder, fetchContentBadges, {
    success: (state, payload) => {
      Object.assign(state.badges, payload.badges);
    },
  });
  addQueryCases(builder, fetchYtVideoMeta, {
    success: (state, payload) => {
      state.content[payload.key] = payload;
    },
  });
  addQueryCases(builder, refreshDfContentMeta, {
    success(state, actionPayload) {
      const { contentEntries } = actionPayload;
      for (const contentEntry of contentEntries) {
        state.content[contentEntry.key] = contentEntry;
      }
    },
  });
  builder.addCase(updateDfContentQuery, (state, action) => {
    return {
      ...state,
      currentQuery: {
        ...state.currentQuery,
        ...action.payload,
        page: action.payload.page || 1,
      },
    };
  });
  builder.addCase(setDfContentQuery, (state, action) => {
    return {
      ...state,
      currentQuery: action.payload,
    };
  });
  builder.addCase(resetDfContentQuery, (state) => {
    return {
      ...state,
      currentQuery: DefaultContentQuery,
    };
  });
  builder.addCase(resetState, (state) => {
    return {
      ...state,
      currentQuery: DefaultContentQuery,
      selectedItem: null,
    };
  });
});
