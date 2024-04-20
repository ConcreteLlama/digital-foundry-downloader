import { createReducer } from "@reduxjs/toolkit";
import { AuthErrorResponseData } from "df-downloader-common";
import { DfUiError } from "../../utils/error";
import { addQueryCases } from "../utils";
import { login, logout, queryCurrentUser, register } from "./auth-user.actions";
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
});
