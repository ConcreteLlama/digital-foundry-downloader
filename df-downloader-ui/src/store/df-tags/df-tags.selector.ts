import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

export type TagSelectionMode = "all" | "selected" | "not-selected";

const selectSelf = (state: RootState) => state.dfTags;
const selectQueryTags = (state: RootState) => state.dfContent.currentQuery.tags || [];

export const selectDfTags = createSelector(selectSelf, (state) => state.tags);
export const selectDfTagNames = createSelector(selectDfTags, (tags) => tags.map((tag) => tag.tag));

export const selectSelectedTags = createSelector(selectDfTags, selectQueryTags, (allTags, selectedTags) =>
  allTags.filter((tagInfo) => selectedTags.includes(tagInfo.tag))
);
export const selectNonSelectedTags = createSelector(selectDfTags, selectQueryTags, (allTags, selectedTags) =>
  allTags.filter((tagInfo) => !selectedTags.includes(tagInfo.tag))
);

export const getTagSelector = (tagSelectionMode: TagSelectionMode) => {
  if (tagSelectionMode === "selected") {
    return selectSelectedTags;
  } else if (tagSelectionMode === "not-selected") {
    return selectNonSelectedTags;
  } else {
    return selectDfTags;
  }
};
