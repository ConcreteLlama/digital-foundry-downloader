import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config.js";

export const selectSelf = (state: RootState) => state.config;
export const selectConfig = createSelector(selectSelf, (state) => state.config);
export const selectConfigSection = <T extends keyof DfDownloaderConfig>(section: T) =>
  createSelector(selectSelf, (state): DfDownloaderConfig[T] | undefined => {
    return state.config?.[section];
  });
export const selectConfigLoading = createSelector(selectSelf, (state) => state.loading);
export const selectConfigError = createSelector(selectSelf, (state) => state.error);
