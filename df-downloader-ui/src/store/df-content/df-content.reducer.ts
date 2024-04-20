import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import {
  fetchSingleDfContentEntry,
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
  error: null,
};
export const dfContentReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryDfContent, {
    success: (state, payload) => {
      state.currentQuery = payload.params;
      state.totalItems = payload.totalResults;
      for (const content of payload.content) {
        state.content[content.name] = content;
      }
      state.selectedContent = payload.content.map((c) => c.name);
    },
  });
  addQueryCases(builder, fetchSingleDfContentEntry, {
    success: (state, payload) => {
      state.content[payload.name] = payload;
    },
  });
  addQueryCases(builder, refreshDfContentMeta, {
    success(state, actionPayload) {
      const { contentEntries } = actionPayload;
      for (const contentEntry of contentEntries) {
        state.content[contentEntry.name] = contentEntry;
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
