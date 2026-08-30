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
    /**
     * A failure is only an answer about Digital Foundry if we were able to
     * ask. Marking the query initialised regardless meant the very first
     * /df-user call after signing in - which 401s while the app's own
     * session is still being established - counted as "checked, no DF
     * user", and the session dialog announced "Not Connected to
     * DigitalFoundry.net" over a perfectly valid cookie.
     *
     * 401 is the app's own auth talking, not the site's, so it leaves the
     * state uninitialised and the dialog showing its checking spinner
     * until a real answer arrives.
     */
    failed: (state, error) => {
      if (error?.code === 401) {
        return;
      }
      state.initialized = true;
    },
  });
});
