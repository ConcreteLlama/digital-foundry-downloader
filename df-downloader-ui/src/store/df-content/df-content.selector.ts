import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { createDeepEqualSelector, createShallowEqualSelector } from "../utils";
import { DfContentEntry } from "df-downloader-common";

const selectSelf = (state: RootState) => state.dfContent;
const selectContent = (state: RootState) => state.dfContent.content;
const selectQuery = (state: RootState) => state.dfContent.currentQuery;
const selectTotalItems = (state: RootState) => state.dfContent.totalItems;

export const selectDfContentEntryList = createDeepEqualSelector(selectContent, (content) => content);
export const selectDfContentEntryMap = createSelector(selectDfContentEntryList, (content) => {
  return new Map<string, DfContentEntry>(content.map((item) => [item.name, item]));
});
export const selectDfContentEntryKeys = createShallowEqualSelector(selectContent, (content) =>
  content.map((content) => content.name as string)
);
export const selectDfContentInfoItem = (key: string) =>
  createSelector(selectDfContentEntryMap, (state) => {
    return state.get(key);
  });

export const selectTotalContentItems = createSelector(selectSelf, (state) => state.totalItems);
export const selectCurrentQuery = createSelector(selectSelf, (state) => state.currentQuery);

export const selectPageInfo = createSelector(selectQuery, selectTotalItems, (query, totalItems) => ({
  currentPage: query.page!,
  limit: query.limit!,
  numPages: Math.ceil(totalItems / query.limit!),
}));
