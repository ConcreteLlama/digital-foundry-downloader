import { createReducer } from "@reduxjs/toolkit";
import { addQueryCases } from "../utils";
import { queryDownloadQueue } from "./download-queue.action";
import { DownloadQueueState } from "./download-queue.types";

const INITIAL_STATE: DownloadQueueState = {
  loading: false,
  downloadQueue: [],
  error: null,
};

export const downloadQueueReducer = createReducer(INITIAL_STATE, (builder) => {
  addQueryCases(builder, queryDownloadQueue, {
    success: (state, payload) => {
      return {
        ...state,
        downloadQueue: payload,
      };
    },
  });
});
