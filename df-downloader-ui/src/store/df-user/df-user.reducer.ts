import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { queryDfUserInfo } from "./df-user.actions";
import { DfUserState } from "./df-user.types";

const INITIAL_STATE: DfUserState = {
  loading: false,
  error: null,
  initialized: false,
};

export const dfUserReducer = createReducer(INITIAL_STATE, (builder) => {
  return addQueryCases(builder, queryDfUserInfo, {
    success: (state, payload) => {
      state.userInfo = payload;
      state.initialized = true;
    },
    failed: (state) => {
      state.initialized = true;
    },
  });
});
