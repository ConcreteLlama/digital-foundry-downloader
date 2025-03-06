import { createReducer } from "@reduxjs/toolkit";
import { AuthErrorResponseData } from "df-downloader-common";
import { DfUiError } from "../../utils/error";
import { triggerSnackbar } from "../../utils/snackbar.tsx";
import { addQueryCases } from "../utils";
import { login, logout, queryCurrentUser, register, updateUserInfo } from "./auth-user.actions";
import { userLoggedOut } from "./auth-user.simple-actions.ts";
import { AuthUserState } from "./auth-user.types";

const initialLoginState: AuthUserState = {
  user: null,
  loading: false,
  error: null,
  loginError: null,
  canRegister: false,
};

export const authUserReducer = createReducer(initialLoginState, (builder) => {
  addQueryCases(builder, queryCurrentUser, {
    success: (state, payload) => {
      state.user = payload;
    },
    failed: (state, payload: DfUiError<AuthErrorResponseData>) => {
      state.error = payload;
      state.user = null;
      state.canRegister = payload.details?.registrationAvailable || false;
    },
  });
  addQueryCases(builder, login, {
    success: "user",
    failed: "loginError",
  });
  addQueryCases(builder, register, {
    success: (state) => {
      state.user = null;
      state.canRegister = false;
    },
    failed: (state, payload) => {
      state.error = payload;
    },
  });
  addQueryCases(builder, logout, {
    success: (state) => {
      state.user = null;
    },
    failed: (state, payload) => {
      state.error = payload;
    },
  });
  addQueryCases(builder, updateUserInfo, {
    success: (state, payload) => {
      state.user && (state.user.userInfo = payload.updatedUserInfo);
    },
    failed: (state, payload) => {
      state.error = payload;
    },
  });
  builder.addCase(userLoggedOut, (state) => {
    if (state.user) {
      triggerSnackbar("Your session has expired. Please log in again.", {
        variant: 'error',
      });
    }
    state.user = null;
  });
});
