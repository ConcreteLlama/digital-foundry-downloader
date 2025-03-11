import { createReducer } from "@reduxjs/toolkit";
import { ConfigState, DfConfigSectionStateRecord } from "./config.types";
import { addQueryCases } from "../utils";
import { queryConfigSection, updateConfigSection } from "./config.action";
import { DfDownloaderConfig, DfDownloaderConfigKeys } from "df-downloader-common/config/df-downloader-config";

const initialConfigState = Object.fromEntries(DfDownloaderConfigKeys.map((section) => ([section, {
  initialised: false,
  loading: false,
  error: null,
  value: null,
}]))) as Record<keyof DfDownloaderConfig, DfConfigSectionStateRecord<any>>;

const INITIAL_STATE: ConfigState = {
  loading: false,
  error: null,
  config: initialConfigState,
};

export const configReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryConfigSection, {
    success: (state, payload) => {
      state.loading = false;
      state.error = null;
      (state.config[payload.section]) = {
        initialised: true,
        loading: false,
        error: null,
        value: payload.value as any,
      }
    },
  });
  addQueryCases(builder, updateConfigSection, {
    success: (state, payload) => {
      state.loading = false;
      state.error = null;
      (state.config[payload.section]) = {
        initialised: true,
        loading: false,
        error: null,
        value: payload.value ? payload.value as any : state.config[payload.section]?.value || null,
      }
    },
  });
});
