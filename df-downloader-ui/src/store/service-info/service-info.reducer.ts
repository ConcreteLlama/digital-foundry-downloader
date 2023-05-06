import { createReducer } from "@reduxjs/toolkit";
import { ServiceInfoState } from "./service-info.types";
import { addQueryCases } from "../utils";
import { queryServiceInfo } from "./service-info.actions";

const INITIAL_STATE: ServiceInfoState = {
  loading: false,
  error: null,
};

export const serviceInfoReducer = createReducer(INITIAL_STATE, (builder) => {
  return addQueryCases(builder, queryServiceInfo, {
    success: (state, payload) => {
      return {
        ...state,
        serviceInfo: payload,
      };
    },
  });
});
