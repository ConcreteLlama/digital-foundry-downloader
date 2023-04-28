import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import {
  fetchSingleDfContentInfo,
  queryDfContentInfo,
  resetDfContentInfoQuery,
  resetState,
  setDfContentInfoQuery,
  setSearchOpen,
  setSelectedItem,
  updateDfContentInfoQuery,
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
  addQueryCases(builder, queryDfContentInfo, {
    success: (state, payload) => {
      return {
        ...state,
        totalItems: payload.totalResults,
        content: payload.content,
      };
    },
  });
  addQueryCases(builder, fetchSingleDfContentInfo, {
    success: (state, payload) => {
      const content = state.content.map((c) => (c.name === payload.name ? payload : c));
      return {
        ...state,
        content,
      };
    },
  });
  builder.addCase(updateDfContentInfoQuery, (state, action) => {
    return {
      ...state,
      currentQuery: {
        ...state.currentQuery,
        ...action.payload,
        page: action.payload.page || 1,
      },
    };
  });
  builder.addCase(setDfContentInfoQuery, (state, action) => {
    return {
      ...state,
      currentQuery: action.payload,
    };
  });
  builder.addCase(resetDfContentInfoQuery, (state, action) => {
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
