import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";
import { createDeepEqualSelector, createShallowEqualSelector } from "../utils";

const selectSelf = (state: RootState) => state.dfContent;
const selectContent = (state: RootState) => state.dfContent.content;
const selectQuery = (state: RootState) => state.dfContent.currentQuery;
const selectTotalItems = (state: RootState) => state.dfContent.totalItems;

export const selectDfContentEntryMap = createDeepEqualSelector(selectContent, (content) => ({...content}))
export const selectDfContentEntryCurrentKeys = createShallowEqualSelector(selectSelf, (state) => state.selectedContent);
export const selectDfContentInfoItem = (key: string) =>
  createSelector(selectDfContentEntryMap, (state) => {
    return state[key];
  });

export const selectTotalContentItems = createSelector(selectSelf, (state) => state.totalItems);
export const selectCurrentQuery = createSelector(selectSelf, (state) => state.currentQuery);

export const selectPageInfo = createSelector(selectQuery, selectTotalItems, (query, totalItems) => ({
  currentPage: query.page!,
  limit: query.limit!,
  numPages: Math.ceil(totalItems / query.limit!),
}));
