import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { queryDfTags } from "./df-tags.action";
import { DfTagsState } from "./df-tags.types";

const INITIAL_STATE: DfTagsState = {
  loading: false,
  tags: [],
  error: null,
};
export const dfTagsReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryDfTags, {
    success: (state, payload) => {
      state.tags = payload.tags;
    },
  });
});
