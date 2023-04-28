import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { queryUserInfo } from "./user.actions";
import { UserState } from "./user.types";

const INITIAL_STATE: UserState = {
  loading: false,
  error: null,
};

export const userReducer = createReducer(INITIAL_STATE, (builder) => {
  return addQueryCases(builder, queryUserInfo, {
    success: (state, payload) => {
      return {
        ...state,
        userInfo: payload,
      };
    },
  });
});
