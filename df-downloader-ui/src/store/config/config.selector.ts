import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { DfDownloaderConfig } from "df-downloader-common/config/df-downloader-config";

export const selectSelf = (state: RootState) => state.config;
export const selectConfig = createSelector(selectSelf, (state) => state.config);
export const selectConfigSection = <T extends keyof DfDownloaderConfig>(section: T) =>
  createSelector(selectSelf, (state): DfDownloaderConfig[T] | undefined | null => {
    return state.config[section].value;
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
    const configSection = state.config[section].value as SECTION;
    return configSection?.[field];
  });
export const selectConfigLoading = createSelector(selectSelf, (state) => state.loading);
export const selectConfigError = createSelector(selectSelf, (state) => state.error);
export const selectConfigSectionInitialised = (section: keyof DfDownloaderConfig) =>
  createSelector(selectSelf, (state) => state.config[section].initialised);
export const selectConfigSectionLoading = (section: keyof DfDownloaderConfig) =>
  createSelector(selectSelf, (state) => state.config[section].loading);
export const selectConfigSectionError = (section: keyof DfDownloaderConfig) =>
  createSelector(selectSelf, (state) => state.config[section].error);
export const selectConfigSectionState = <T extends keyof DfDownloaderConfig>(section: T) =>
  createSelector(selectSelf, (state) => state.config[section]);

export const selectDevConfigEnabled = createSelector(selectSelf, (state) => state.config?.dev?.value?.devConfigEnabled);
