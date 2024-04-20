import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";

export const selectSelf = (state: RootState) => state.config;
export const selectConfig = createSelector(selectSelf, (state) => state.config);
export const selectConfigSection = <T extends keyof DfDownloaderConfig>(section: T) =>
  createSelector(selectSelf, (state): DfDownloaderConfig[T] | undefined => {
    return state.config?.[section];
  });
export const selectConfigSectionField = <
  T extends keyof DfDownloaderConfig,
  K extends keyof SECTION,
  SECTION = NonNullable<DfDownloaderConfig[T]>
>(
  section: T,
  field: K
) =>
  createSelector(selectSelf, (state): SECTION[K] | undefined => {
    const configSection = state.config?.[section] as SECTION;
    return configSection?.[field];
  });
export const selectConfigLoading = createSelector(selectSelf, (state) => state.loading);
export const selectConfigError = createSelector(selectSelf, (state) => state.error);

export const selectDevConfigEnabled = createSelector(selectSelf, (state) => state.config?.dev?.devConfigEnabled);
