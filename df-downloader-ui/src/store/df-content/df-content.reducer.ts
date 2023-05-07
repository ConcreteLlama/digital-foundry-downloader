import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import {
  fetchSingleDfContentEntry,
  queryDfContent,
  resetDfContentQuery,
  resetState,
  setDfContentQuery,
  setSearchOpen,
  setSelectedItem,
  updateDfContentQuery,
} from "./df-content.action";
import { DefaultContentQuery, DfContentInfoState } from "./df-content.types";

const INITIAL_STATE: DfContentInfoState = {
  loading: false,
  content: [],
  totalItems: 0,
  currentQuery: DefaultContentQuery,
  searchOpen: false,
  selectedItem: null,
  error: null,
};
export const dfContentReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryDfContent, {
    success: (state, payload) => {
      return {
        ...state,
        totalItems: payload.totalResults,
        content: payload.content,
      };
    },
  });
  addQueryCases(builder, fetchSingleDfContentEntry, {
    success: (state, payload) => {
      const content = state.content.map((c) => (c.name === payload.name ? payload : c));
      return {
        ...state,
        content,
      };
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
  builder.addCase(resetDfContentQuery, (state, action) => {
    return {
      ...state,
      currentQuery: DefaultContentQuery,
    };
  });
  builder.addCase(setSelectedItem, (state, action) => {
    return {
      ...state,
      selectedItem: action.payload,
      searchOpen: false,
    };
  });
  builder.addCase(setSearchOpen, (state, action) => {
    return {
      ...state,
      searchOpen: action.payload,
      selectedItem: null,
    };
  });
  builder.addCase(resetState, (state) => {
    return {
      ...state,
      currentQuery: DefaultContentQuery,
      selectedItem: null,
      searchOpen: false,
    };
  });
});
