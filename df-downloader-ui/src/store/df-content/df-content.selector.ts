import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

const selectSelf = (state: RootState) => state.dfContent;
const selectContent = (state: RootState) => state.dfContent.content;
const selectQuery = (state: RootState) => state.dfContent.currentQuery;
const selectTotalItems = (state: RootState) => state.dfContent.totalItems;
const selectSearchOpen = (state: RootState) => state.dfContent.searchOpen;

export const selectDfContentInfoList = createSelector(selectContent, (content) => content);
export const selectDfContentInfoKeys = createSelector(selectSelf, (state) =>
  state.content.map((content) => content.name as string)
);
export const selectTotalContentItems = createSelector(selectSelf, (state) => state.totalItems);
export const selectCurrentQuery = createSelector(selectSelf, (state) => state.currentQuery);
export const tagIsSelected = (tag: string) => (state: RootState) =>
  Boolean(state.dfContent.currentQuery.tags?.includes(tag));

export const selectPageInfo = createSelector(selectQuery, selectTotalItems, (query, totalItems) => ({
  currentPage: query.page,
  limit: query.limit,
  numPages: Math.ceil(totalItems / query.limit),
}));

export const selectQueryTags = createSelector(selectQuery, (queryParams) => queryParams.tags || []);
export const selectTagQueryMode = createSelector(selectQuery, (queryParams) => queryParams.tagMode);

export const selectDfContentInfoItem = (key: string) =>
  createSelector(selectDfContentInfoList, (state) => {
    return state.find((item) => item.name === key);
  });

export const selectSelectedContentItem = createSelector(selectSelf, (state) => state.selectedItem);

export const selectSearchOpenState = createSelector(selectSearchOpen, (searchOpen) => searchOpen);
