import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "../store";

export type TagSelectionMode = "all" | "selected" | "not-selected";

const selectSelf = (state: RootState) => state.dfTags;

export const selectDfTags = createSelector(selectSelf, (state) => state.tags);
export const selectDfTagNames = createSelector(selectDfTags, (tags) => tags.map((tag) => tag.tag));
