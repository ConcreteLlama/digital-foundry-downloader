import { createReducer } from "@reduxjs/toolkit";
import { ConfigState } from "./config.types";
import { addQueryCases } from "../utils";
import { queryConfigSection, updateConfigSection } from "./config.action";

const INITIAL_STATE: ConfigState = {
  loading: false,
  error: null,
  config: null,
};

export const configReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryConfigSection, {
    success: (state, payload) => {
      return {
        ...state,
        config: {
          ...state.config,
          [payload.section]: payload.value,
        },
      };
    },
  });
  addQueryCases(builder, updateConfigSection, {
    success: (state, payload) => {
      if (!payload.value) {
        return state;
      }
      return {
        ...state,
        config: {
          ...(state.config || {}),
          [payload.section]: payload.value,
        },
      };
    },
  });
});
